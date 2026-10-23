"""Focused SQL diagnostics on verified temporary Supabase; no resets or cleanup.

Authorization fixtures live in a rolled-back transaction. Race fixtures use new
UUIDs and are retained. All PostgreSQL calls target the fixed temporary container.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

CONTAINER = 'supabase_db_silsanplexp2c2'
checks = []

def command(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf8', **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout

def sql(text):
    return command(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], input=text)

def quote(value):
    return "'" + str(value).replace("'", "''") + "'"

def js(value):
    return quote(json.dumps(value)) + '::jsonb'

def uid():
    return str(uuid.uuid4())

def check(label, condition, evidence=None):
    checks.append({'assertion': label, 'pass': bool(condition), 'evidence': evidence})
    if not condition:
        print(json.dumps(checks, indent=2))
        raise AssertionError(label)

def read(query):
    return json.loads(sql(query).strip())

def verify():
    directory = Path(os.environ['LOCALAPPDATA']) / 'Temp/silsanplex-phase2c2-20261021'
    config = (directory / 'supabase/config.toml').read_text(encoding='utf8')
    assert 'project_id = "silsanplexp2c2"' in config
    for name, port, host in [(CONTAINER, '5432/tcp', '58122'), ('supabase_kong_silsanplexp2c2', '8000/tcp', '58121')]:
        c = json.loads(command(['docker', 'inspect', name]))[0]
        assert c['State']['Running'] and c['Config']['Labels']['com.supabase.cli.project'] == 'silsanplexp2c2'
        assert any(p['HostPort'] == host for p in c['NetworkSettings']['Ports'][port])
        if name == CONTAINER:
            assert any(m['Type'] == 'volume' and m['Name'] == 'supabase_db_silsanplexp2c2' for m in c['Mounts'])
    v = json.loads(command(['docker', 'volume', 'inspect', 'supabase_db_silsanplexp2c2']))[0]
    assert v['Labels']['com.supabase.cli.project'] == 'silsanplexp2c2'
    definition = sql("select pg_get_functiondef('public.record_distribution_delivery_outcome(jsonb)'::regprocedure)")
    assert 'pg_advisory_xact_lock' in definition and 'DISTRIBUTION_OUTCOME_OPERATION_KEY_REUSED' in definition

CAPTURE = """
create function pg_temp.capture(q text) returns jsonb language plpgsql as $$
declare v jsonb; s text; m text;
begin execute q into v; return jsonb_build_object('state','00000','value',v);
exception when others then get stacked diagnostics s=returned_sqlstate,m=message_text;
return jsonb_build_object('state',s,'message',m); end $$;
"""

def auth_tests(org):
    # Existing commands are replayed read-only; no existing row is advanced.
    outcome = read("select row_to_json(o) from distribution_delivery_outcomes o join distribution_deliveries d on d.id=o.delivery_id where d.guide_number like 'T002-%' order by o.created_at desc limit 1")
    lines = read(f"select json_agg(json_build_object('orderLineId',order_line_id,'cantidad',quantity_delivered)) from distribution_delivery_outcome_lines where outcome_id={quote(outcome['id'])}")
    payload = dict(organizationId=org, entregaId=outcome['delivery_id'], operationKey=outcome['operation_key'],
                   expectedLockVersion=1, resultado=outcome['result_status'], fecha=outcome['occurred_on'],
                   evidencia=outcome['evidence'], incidencias=outcome['incidents'], lineas=lines)
    save = read("select row_to_json(o) from distribution_command_operations o where command_type='save_distribution_delivery' order by created_at limit 1")
    order = read(f"select row_to_json(o) from orders o where id=(select order_id from distribution_deliveries where id={quote(outcome['delivery_id'])})")
    dispatch = read(f"select metadata from audit_events where action='ORDER_DISPATCHED' and entity_id={quote(order['id'])} limit 1")
    foreign_org, foreign_actor = uid(), uid()
    actors = {name: uid() for name in ['none', 'view', 'manage']}
    view_role, manage_role = 'P2C4_' + uid().replace('-', '')[:12].upper(), 'P2C4_' + uid().replace('-', '')[:12].upper()
    setup = f"begin; {CAPTURE} insert into organizations(id,name,slug) values ({quote(foreign_org)},'2C4 rollback tenant',{quote('p2c4-'+foreign_org)});"
    for name, actor in {**actors, 'foreign': foreign_actor}.items():
        setup += f"insert into auth.users(id,email,raw_user_meta_data) values({quote(actor)},{quote(actor+'@example.invalid')},'{{\"full_name\":\"2C4 rollback\"}}');"
        setup += f"insert into organization_memberships(organization_id,user_id) values({quote(foreign_org if name=='foreign' else org)},{quote(actor)});"
    setup += f"insert into roles(code,name) values({quote(view_role)},'2C4 view'),({quote(manage_role)},'2C4 manage');"
    for role, perms in [(view_role,['DISTRIBUTION_VIEW']), (manage_role,['DISTRIBUTION_VIEW','DISTRIBUTION_MANAGE','INVENTORY_MANAGE'])]:
        for p in perms:
            setup += f"insert into role_permissions(role_code,permission_code) values({quote(role)},{quote(p)});"
    for actor, role, tenant in [(actors['view'],view_role,org),(actors['manage'],manage_role,org),(foreign_actor,manage_role,foreign_org)]:
        setup += f"insert into user_roles(organization_id,user_id,role_code) values({quote(tenant)},{quote(actor)},{quote(role)});"
    business = ['orders','sales','inventory_movements','inventory_reservations','distribution_deliveries',
      'distribution_delivery_items','distribution_delivery_inventory_allocations','distribution_delivery_outcomes',
      'distribution_delivery_outcome_lines','distribution_command_operations','audit_events']
    business_snapshot = 'jsonb_build_array(' + ','.join(f"(select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]') from {t} x)" for t in business) + ')'
    setup += f'create temporary table before_business as select {business_snapshot} as v;'
    expressions = {
        'save': f"select to_jsonb(save_distribution_delivery({js(save['request_payload'])}))",
        'outcome': f"select to_jsonb(record_distribution_delivery_outcome({js(payload)}))",
        'movements': f"select coalesce(jsonb_agg(x),'[]') from list_distribution_inventory_movements({quote(org)},{quote(order['id'])},null) x",
        'trace': f"select coalesce(jsonb_agg(x),'[]') from list_distribution_delivery_inventory_trace({quote(org)},{quote(outcome['delivery_id'])}) x",
        'dispatch': f"select to_jsonb(dispatch_order_from_reservations({js(dict(organization_id=org,order_id=order['id'],operation_key=dispatch['operation_key'],items=dispatch['requested_items']))}))",
    }
    statements, expected = [], []
    for identity in ['anon','none','view','manage','foreign']:
        actor = foreign_actor if identity=='foreign' else actors.get(identity)
        statements.append(f"set local role {'anon' if identity=='anon' else 'authenticated'}; select set_config('request.jwt.claim.sub',{quote(actor or '')},true);")
        for name, expression in expressions.items():
            statements.append(f"select pg_temp.capture({quote(expression)});")
            allowed = identity=='manage' or (identity=='view' and name in ['movements','trace'])
            expected.append((identity, name, allowed))
    # Revoke only the newly created role, then retry already confirmed commands.
    statements.append(f"reset role; delete from user_roles where user_id={quote(actors['manage'])}; set local role authenticated; select set_config('request.jwt.claim.sub',{quote(actors['manage'])},true);")
    for name in expressions:
        statements.append(f"select pg_temp.capture({quote(expressions[name])});")
        expected.append(('revoked',name,False))
    # A manager of tenant B cannot obtain A data by passing A IDs with B scope.
    statements.append(f"reset role; set local role authenticated; select set_config('request.jwt.claim.sub',{quote(foreign_actor)},true);")
    for name in ['movements','trace']:
        expression = expressions[name].replace(quote(org),quote(foreign_org))
        statements.append(f"select pg_temp.capture({quote(expression)});")
        expected.append(('foreign-own-scope',name,True))
    for name in ['save','outcome','dispatch']:
        expression = expressions[name].replace(org,foreign_org)
        statements.append(f"select pg_temp.capture({quote(expression)});")
        expected.append(('foreign-mixed-ids',name,True))
    statements.append(f"reset role; select 'SNAPSHOT_IDENTICAL=' || ({business_snapshot}=(select v from before_business)); rollback;")
    output = sql(setup + '\n'.join(statements))
    results = [json.loads(line) for line in output.splitlines() if line.startswith('{"state"') or line.startswith('{"value"')]
    check('authorization/no business side effects before rollback','SNAPSHOT_IDENTICAL=true' in output)
    check('authorization result count',len(results)==len(expected),len(results))
    for (identity,name,allowed),result in zip(expected,results):
        if identity=='foreign-own-scope':
            ok = result['state']=='00000' and result['value']==[]
        elif identity=='foreign-mixed-ids':
            expected_error = {'save':('P0001','DISTRIBUTION_ORDER_NOT_FOUND'),
              'outcome':('P0001','DISTRIBUTION_NOT_FOUND'),
              'dispatch':('P0002','ORDER_DISPATCH_ORDER_NOT_FOUND')}[name]
            ok = (result['state'],result.get('message'))==expected_error
        elif allowed and name=='dispatch':
            ok = result['state']=='00000' and result.get('value')==order['id']
        elif allowed:
            ok = result['state']=='00000'
            if name=='save': ok = ok and result.get('value')==save['result_id']
            if name=='outcome': ok = ok and result.get('value')==outcome['id']
            if name=='trace': ok = ok and len(result.get('value',[]))>0 and all(x['delivery_id']==outcome['delivery_id'] for x in result['value'])
        else:
            ok = result['state']=='42501'
        check(f'{identity}/{name}',ok,result)

def seed(org, actor):
    product, customer, warehouse, location = [uid() for _ in range(4)]
    label = 'P2C4-' + uid()[:8].upper()
    text = f"""begin;
    insert into products(id,organization_id,code,description,unit_of_measure,tax_affectation,batch_control,expiration_control,created_by,updated_by)
    values('{product}','{org}','{label}','{label}','UND','gravado',false,false,'{actor}','{actor}');
    insert into customers(id,organization_id,document_type,document_number,legal_name,created_by,updated_by)
    values('{customer}','{org}','DNI','{str(uuid.uuid4().int)[:8]}','{label}','{actor}','{actor}');
    insert into warehouses(id,organization_id,code,name,created_by,updated_by)
    values('{warehouse}','{org}','{label}','{label}','{actor}','{actor}');
    insert into warehouse_locations(id,organization_id,warehouse_id,code,name,created_by,updated_by)
    values('{location}','{org}','{warehouse}','TEST','{label}','{actor}','{actor}');
    create temporary table fixture(value jsonb);
    select set_config('request.jwt.claim.sub','{actor}',true);
    grant select,insert on pg_temp.fixture to authenticated;
    set local role authenticated;
    do $seed$ declare o uuid; s uuid; l uuid; m uuid; d uuid; base jsonb; deliveries jsonb='[]'; begin
    perform record_inventory_movement(jsonb_build_object('organization_id','{org}','product_id','{product}',
      'warehouse_id','{warehouse}','location_id','{location}','movement_type','entrada','quantity',10,
      'unit_cost',10,'stock_status','available','operation_date',current_date,'reason','{label}','document_reference','{label}'));
    o := create_order(jsonb_build_object('organization_id','{org}','operation_key',gen_random_uuid(),
      'customer_id','{customer}','warehouse_id','{warehouse}', 'items',jsonb_build_array(jsonb_build_object('product_id','{product}','quantity',6,'unit_price',20))));
    select id into l from order_items where order_id=o;
    s := create_sale_from_order('{org}',o,jsonb_build_object('operation_key',gen_random_uuid(),
      'document_type','boleta','series','B004','document_number','{label}','warehouse','{label}'));
    perform dispatch_order_from_reservations(jsonb_build_object('organization_id','{org}','order_id',o,'sale_id',s,
      'operation_key',gen_random_uuid(),'items',jsonb_build_array(jsonb_build_object('order_item_id',l,'quantity',6))));
    select id into m from inventory_movements where source_id=l and movement_type='salida';
    for i in 1..2 loop
      base := jsonb_build_object('organization_id','{org}','order_id',o,'sale_id',s,
        'order_number',(select order_number from orders where id=o),'customer_name','{label}',
        'issue_date',current_date-1,'delivery_date',current_date+1,'scheduled_date',current_date+1,
        'guide_number','{label}-'||i,'numero_despacho','{label}-'||i,'transport_type','interno',
        'tracking_status','en_curso','delivery_status','programado','direction','Fixture 2C4',
        'modalidad','movilidad_propia','conductor','Fixture','vehiculo','Fixture','placa','TEST-004',
        'operation_key',gen_random_uuid(),'items',jsonb_build_array(jsonb_build_object('id',l,'cantidad',3,
        'movement_allocations',jsonb_build_array(jsonb_build_object('inventory_movement_id',m,'quantity',3)))));
      d := save_distribution_delivery(base);
      deliveries := deliveries || jsonb_build_array(jsonb_build_object('id',d,'payload',base));
    end loop;
    insert into pg_temp.fixture values(jsonb_build_object('label','{label}','org','{org}','actor','{actor}',
      'order',o,'line',l,'product','{product}','deliveries',deliveries));
    end $seed$;
    reset role; select value from fixture; commit;"""
    output = sql(text)
    return json.loads(next(s for s in output.splitlines() if s.startswith('{')))

def save_expression(f, delivery, **changes):
    payload = {**delivery['payload'], 'id':delivery['id'], 'operation_key':uid(),
               'expected_lock_version': int(sql(f"select lock_version from distribution_deliveries where id={quote(delivery['id'])}").strip()), **changes}
    return f"select to_jsonb(save_distribution_delivery({js(payload)}))"

def result_expression(f, delivery, quantity, status):
    payload = dict(organizationId=f['org'],entregaId=delivery['id'],operationKey=uid(),
      expectedLockVersion=int(sql(f"select lock_version from distribution_deliveries where id={quote(delivery['id'])}").strip()),
      resultado=status,fecha=sql("select timezone('America/Lima',now())::date").strip(),evidencia='2C4 real SQL',
      lineas=[dict(orderLineId=f['line'],cantidad=quantity)])
    return f"select to_jsonb(record_distribution_delivery_outcome({js(payload)}))"

def authenticated(f, expression):
    output = sql(f"begin; {CAPTURE} select set_config('request.jwt.claim.sub',{quote(f['actor'])},true); set local role authenticated; select pg_temp.capture({quote(expression)}); commit;")
    return json.loads(next(s for s in output.splitlines() if s.startswith('{')))

def state(f):
    return read(f"""select json_build_object('deliveries',(select json_agg(x order by id) from
      (select id,delivery_status,lock_version,scheduled_date from distribution_deliveries where order_id='{f['order']}') x),
      'order',(select fulfillment_status from orders where id='{f['order']}'),
      'movements',(select count(*) from inventory_movements where product_id='{f['product']}'),
      'allocations',(select coalesce(sum(quantity),0) from distribution_delivery_inventory_allocations where order_id='{f['order']}'),
      'outcomes',(select count(*) from distribution_delivery_outcomes where delivery_id in(select id from distribution_deliveries where order_id='{f['order']}')),
      'lines',(select count(*) from distribution_delivery_outcome_lines where order_id='{f['order']}'),
      'audits',(select count(*) from audit_events where entity_id in(select id::text from distribution_deliveries where order_id='{f['order']}')))
    """)

def race(f, first, second, label, conflict=True):
    names = ['p2c4_a_'+uid()[:8], 'p2c4_b_'+uid()[:8]]
    def launch(name, expr, pause):
        body = f"set application_name={quote(name)}; begin; set local statement_timeout='10s'; {CAPTURE} select set_config('request.jwt.claim.sub',{quote(f['actor'])},true); set local role authenticated; select pg_temp.capture({quote(expr)}); select pg_sleep({pause}); commit;"
        p = subprocess.Popen(['docker','exec','-i',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8')
        p.stdin.write(body); p.stdin.close(); p.stdin=None
        return p
    a = launch(names[0],first,3)
    # Wait for A's actual RPC to finish while its transaction retains real locks.
    for _ in range(80):
        if sql(f"select count(*) from pg_stat_activity where application_name={quote(names[0])} and wait_event='PgSleep'").strip()=='1': break
        time.sleep(.025)
    else: raise RuntimeError('first worker did not reach barrier')
    b = launch(names[1],second,0)
    locks = []
    for _ in range(60):
        locks=read(f"select coalesce(json_agg(x),'[]') from(select pid,application_name,wait_event_type from pg_stat_activity where application_name in({quote(names[0])},{quote(names[1])})) x")
        if any(r['application_name']==names[1] and r['wait_event_type']=='Lock' for r in locks): break
        time.sleep(.025)
    check(label+'/independent overlapping sessions',len({r['pid'] for r in locks})==2 and any(r['wait_event_type']=='Lock' for r in locks),locks)
    results=[]
    for p in [a,b]:
        out,err=p.communicate(timeout=15)
        assert p.returncode==0,err
        results.append(json.loads(next(s for s in out.splitlines() if s.startswith('{'))))
    check(label+'/winner',results[0]['state']=='00000',results[0])
    check(label+'/second result',results[1].get('message')=='DISTRIBUTION_VERSION_CONFLICT' if conflict else results[1]['state']=='00000',results[1])
    return results

def concurrency_tests(org, actor):
    f=seed(org,actor)
    print('NEW_RETAINED_FIXTURE '+json.dumps(f))
    a,b=f['deliveries']
    before=state(f)
    race(f,save_expression(f,a,delivery_status='cancelado'),save_expression(f,a,observations='loser edit'),'cancel-versus-edit')
    after=state(f)
    check('cancel/version and status',next(d for d in after['deliveries'] if d['id']==a['id'])['lock_version']==2 and next(d for d in after['deliveries'] if d['id']==a['id'])['delivery_status']=='cancelado',after)
    check('cancel/releases only own allocations',after['allocations']==3 and after['outcomes']==0 and after['movements']==before['movements'],after)
    check('cancel/exact audit delta',after['audits']==before['audits']+2,after)
    race(f,save_expression(f,b,observations='winner edit'),save_expression(f,b,delivery_status='cancelado'),'edit-versus-cancel')
    after2=state(f)
    check('edit/version status quantities',next(d for d in after2['deliveries'] if d['id']==b['id'])['lock_version']==2 and next(d for d in after2['deliveries'] if d['id']==b['id'])['delivery_status']=='programado' and after2['allocations']==3 and after2['outcomes']==0 and after2['movements']==2,after2)
    check('edit/exact audit delta',after2['audits']==after['audits']+1,after2)
    f2=seed(org,actor)
    print('NEW_RETAINED_FIXTURE '+json.dumps(f2))
    for delivery in f2['deliveries']:
        for status in ['preparando','en_curso','en_destino']:
            result=authenticated(f2,save_expression(f2,delivery,delivery_status=status,tracking_status='en_destino' if status=='en_destino' else 'en_curso'))
            check('setup/'+status,result['state']=='00000',result)
        result=authenticated(f2,result_expression(f2,delivery,1,'entrega_parcial'))
        check('setup/partial admissible',result['state']=='00000',result)
    def reschedule(delivery):
        return f"select to_jsonb(reschedule_distribution_delivery({js(dict(organization_id=org,delivery_id=delivery['id'],operation_key=uid(),expected_lock_version=5,scheduled_date=sql('select current_date+2').strip(),reason='2C4 concurrency'))}))"
    a,b=f2['deliveries']
    before=state(f2)
    race(f2,result_expression(f2,a,2,'entregado'),reschedule(a),'outcome-versus-reschedule')
    after=state(f2)
    check('outcome winner/atomic totals',after['outcomes']==before['outcomes']+1 and after['lines']==before['lines']+1 and after['movements']==2 and after['allocations']==6 and next(d for d in after['deliveries'] if d['id']==a['id'])['lock_version']==6,after)
    check('outcome/exact audit delta',after['audits']==before['audits']+2,after)
    race(f2,reschedule(b),result_expression(f2,b,2,'entregado'),'reschedule-versus-outcome')
    after2=state(f2)
    check('reschedule winner/no extra outcome',after2['outcomes']==after['outcomes'] and after2['lines']==after['lines'] and after2['movements']==2 and next(d for d in after2['deliveries'] if d['id']==b['id'])['delivery_status']=='reprogramado' and next(d for d in after2['deliveries'] if d['id']==b['id'])['lock_version']==6,after2)
    check('reschedule/exact audit delta',after2['audits']==after['audits']+2,after2)
    f3=seed(org,actor)
    print('NEW_RETAINED_FIXTURE '+json.dumps(f3))
    a,b=f3['deliveries']
    for status in ['preparando','en_curso','en_destino']:
        result=authenticated(f3,save_expression(f3,a,delivery_status=status,tracking_status='en_destino' if status=='en_destino' else 'en_curso'))
        check('related/setup/'+status,result['state']=='00000',result)
    before=state(f3)
    race(f3,result_expression(f3,a,3,'entregado'),save_expression(f3,b,delivery_status='cancelado'),'related-outcome-versus-cancel',conflict=False)
    final=state(f3)
    check('related/aggregated order',final['order']=='partially_fulfilled' and final['outcomes']==1 and final['lines']==1 and final['allocations']==3 and final['movements']==2,final)
    check('related/versions and terminal states',sorted((d['delivery_status'],d['lock_version']) for d in final['deliveries'])==[('cancelado',2),('entregado',5)],final)
    check('related/exact audit delta',final['audits']==before['audits']+4,final)

def snapshot():
    tables=['organizations','organization_memberships','user_roles','roles','auth.users',
      'products','customers','warehouses','warehouse_locations','orders','order_items','sales','sale_items',
      'inventory_movements','inventory_reservations','distribution_deliveries','distribution_delivery_items',
      'distribution_delivery_inventory_allocations','distribution_delivery_outcomes','distribution_delivery_outcome_lines',
      'distribution_command_operations','audit_events']
    return {t:read(f"select coalesce(json_agg(x),'[]') from {t} x") for t in tables}

if __name__ == '__main__':
    verify()
    org = sql("select id from organizations where slug='drogueria-silsan'").strip()
    assert org
    original=snapshot()
    auth_tests(org)
    check('authorization/all tables unchanged after rollback',snapshot()==original)
    actor=sql("select id from auth.users where email='phase2c3.runner@example.invalid'").strip()
    if '--authorization-only' not in sys.argv:
        concurrency_tests(org,actor)
    final=snapshot()
    check('all pre-existing fixture rows preserved',all(all(row in final[t] for row in rows) for t,rows in original.items()))
    print(json.dumps({'assertions':len(checks),'results':checks},ensure_ascii=False,indent=2))
