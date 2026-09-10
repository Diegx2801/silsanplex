import { LockKeyhole } from 'lucide-react'

import {
  accessModulesInDisplayOrder,
  expandPermissionDependencies,
  type AccessModule,
  type PermissionCode,
} from '@/features/users/userTypes'

interface UserAccessSelectorProps {
  selectedPermissions: PermissionCode[]
  error?: string
  onChange: (permissions: PermissionCode[]) => void
}

const moduleGroups = [
  {
    code: 'process',
    title: 'Procesos operativos',
    description: 'Define las tareas que realizará la cuenta.',
  },
  {
    code: 'master',
    title: 'Mantenedores y recursos',
    description: 'Accesos base, manuales o requeridos por un proceso.',
  },
] as const

function capabilitySourceLabel(permissionCode: PermissionCode, targetModule: AccessModule) {
  for (const module of accessModulesInDisplayOrder) {
    const capability = module.capabilities.find((item) =>
      item.permissionCodes.includes(permissionCode),
    )
    if (capability) return module.code === targetModule.code ? null : module.label
  }
  return null
}

function dependencySources(
  selectedPermissions: readonly PermissionCode[],
  requiredPermissions: readonly PermissionCode[],
  targetModule: AccessModule,
) {
  return selectedPermissions
    .filter((selected) =>
      requiredPermissions.some((required) =>
        selected !== required && expandPermissionDependencies([selected]).includes(required),
      ),
    )
    .map((permission) => capabilitySourceLabel(permission, targetModule))
    .filter((label): label is string => label !== null)
    .filter((label, index, labels) => labels.indexOf(label) === index)
}

function ModuleRow({
  module,
  selectedPermissions,
  effectivePermissions,
  onToggle,
}: {
  module: AccessModule
  selectedPermissions: PermissionCode[]
  effectivePermissions: PermissionCode[]
  onToggle: (permissions: readonly PermissionCode[], enabled: boolean) => void
}) {
  const capabilityStates = module.capabilities.map((capability) => {
    const explicitlySelected = capability.permissionCodes.every((permission) =>
      selectedPermissions.includes(permission),
    )
    const effectivelySelected = capability.permissionCodes.every((permission) =>
      effectivePermissions.includes(permission),
    )
    return {
      capability,
      effectivelySelected,
      automaticallyIncluded: effectivelySelected && !explicitlySelected,
    }
  })
  const sources = capabilityStates
    .filter((state) => state.automaticallyIncluded)
    .flatMap((state) => dependencySources(
      selectedPermissions,
      state.capability.permissionCodes,
      module,
    ))
    .filter((source, index, allSources) => allSources.indexOf(source) === index)
  const dependencyNoteId = `${module.code}-dependency-note`
  const hasAutomaticCapabilities = capabilityStates.some((state) => state.automaticallyIncluded)
  const dependencyExplanation = sources.length > 0
    ? `Usado por: ${sources.join(', ')}.`
    : 'Incluido por otra capacidad seleccionada en este módulo.'

  return (
    <div className="p-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1.2fr)] sm:items-start">
        <div className="min-w-0">
          <p className="text-sm font-medium">{module.label}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{module.description}</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 sm:justify-end">
          {capabilityStates.map(({ capability, effectivelySelected, automaticallyIncluded }) => {
            return (
              <label
                key={capability.code}
                className={`flex min-h-8 shrink-0 items-center gap-2 text-sm ${automaticallyIncluded ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'}`}
                title={automaticallyIncluded ? dependencyExplanation : undefined}
              >
                <input
                  type="checkbox"
                  aria-label={`${module.label}: ${capability.label}`}
                  aria-describedby={automaticallyIncluded ? dependencyNoteId : undefined}
                  checked={effectivelySelected}
                  disabled={automaticallyIncluded}
                  onChange={(event) => onToggle(capability.permissionCodes, event.target.checked)}
                  className="size-4 accent-primary"
                />
                <span>{capability.label}</span>
                {automaticallyIncluded ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none">
                    <LockKeyhole className="size-3" aria-hidden="true" />
                    Requerido
                  </span>
                ) : null}
              </label>
            )
          })}
        </div>
      </div>
      {hasAutomaticCapabilities ? (
        <p
          id={dependencyNoteId}
          className={sources.length > 0
            ? 'mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground'
            : 'sr-only'}
        >
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {sources.length > 0 ? (
              <><span className="font-medium text-foreground">Usado por:</span> {sources.join(', ')}.</>
            ) : dependencyExplanation}
          </span>
        </p>
      ) : null}
    </div>
  )
}

export function UserAccessSelector({
  selectedPermissions,
  error,
  onChange,
}: UserAccessSelectorProps) {
  const effectivePermissions = expandPermissionDependencies(selectedPermissions)

  function toggleCapability(permissionCodes: readonly PermissionCode[], enabled: boolean) {
    const nextPermissions = enabled
      ? [...new Set([...selectedPermissions, ...permissionCodes])]
      : selectedPermissions.filter((permission) => !permissionCodes.includes(permission))
    onChange(nextPermissions)
  }

  return (
    <fieldset aria-describedby="permission-help permission-error">
      <legend className="text-sm font-semibold">Accesos operativos *</legend>
      <p id="permission-help" className="mt-1 text-xs leading-5 text-muted-foreground">
        Administrar, operar, recibir o exportar incluyen Consultar. Los procesos añaden los accesos base que necesitan.
      </p>

      <div className="mt-4 space-y-5">
        {moduleGroups.map((group) => {
          const modules = accessModulesInDisplayOrder.filter((module) => module.group === group.code)
          return (
            <section key={group.code} aria-labelledby={`access-group-${group.code}`}>
              <div className="mb-2">
                <h3 id={`access-group-${group.code}`} className="text-sm font-semibold">
                  {group.title}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p>
              </div>
              <div className="divide-y rounded-md border">
                {modules.map((module) => (
                  <ModuleRow
                    key={module.code}
                    module={module}
                    selectedPermissions={selectedPermissions}
                    effectivePermissions={effectivePermissions}
                    onToggle={toggleCapability}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {error ? (
        <span id="permission-error" className="mt-2 block text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </fieldset>
  )
}
