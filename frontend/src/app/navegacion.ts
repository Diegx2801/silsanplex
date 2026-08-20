import {
  Boxes,
  ChartNoAxesCombined,
  ContactRound,
  House,
  PackageSearch,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { PERMISSIONS, type Permission } from '@/features/auth/permissions'

export interface ElementoNavegacion {
  titulo: string
  ruta: string
  descripcion: string
  icono: LucideIcon
  permission?: Permission
}

interface SeccionNavegacion {
  titulo: string
  elementos: ElementoNavegacion[]
}

export const seccionesNavegacion: SeccionNavegacion[] = [
  {
    titulo: 'Principal',
    elementos: [
      {
        titulo: 'Inicio',
        ruta: '/',
        descripcion: 'Resumen y accesos administrativos',
        icono: House,
      },
    ],
  },
  {
    titulo: 'Operaciones',
    elementos: [
      {
        titulo: 'Productos',
        ruta: '/productos',
        descripcion: 'Catálogo y clasificación',
        icono: PackageSearch,
      },
      {
        titulo: 'Inventario',
        ruta: '/inventario',
        descripcion: 'Stock, lotes y movimientos',
        icono: Boxes,
      },
      {
        titulo: 'Compras',
        ruta: '/compras',
        descripcion: 'Proveedores, órdenes y recepciones',
        icono: ShoppingCart,
      },
      {
        titulo: 'Clientes',
        ruta: '/clientes',
        descripcion: 'Datos fiscales y de contacto',
        icono: ContactRound,
      },
      {
        titulo: 'Ventas',
        ruta: '/ventas',
        descripcion: 'Clientes, cotizaciones y pedidos',
        icono: ReceiptText,
      },
      {
        titulo: 'Distribución',
        ruta: '/distribucion',
        descripcion: 'Despachos y entregas',
        icono: Truck,
      },
    ],
  },
  {
    titulo: 'Control',
    elementos: [
      {
        titulo: 'Reportes',
        ruta: '/reportes',
        descripcion: 'Consultas operativas',
        icono: ChartNoAxesCombined,
      },
      {
        titulo: 'Usuarios',
        ruta: '/usuarios',
        descripcion: 'Accesos, roles y permisos',
        icono: Users,
        permission: PERMISSIONS.USERS_MANAGE,
      },
      {
        titulo: 'Configuración',
        ruta: '/configuracion',
        descripcion: 'Parámetros generales',
        icono: Settings,
      },
    ],
  },
]

export const elementosNavegacion = seccionesNavegacion.flatMap(
  (seccion) => seccion.elementos,
)
