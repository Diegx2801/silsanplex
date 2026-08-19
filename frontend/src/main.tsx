import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { EstadoInicioAplicacion } from '@/components/feedback/EstadoInicioAplicacion'

import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('No se encontró el elemento raíz de la aplicación.')
}

const root = createRoot(rootElement)
const tieneConfiguracionSupabase = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

if (!tieneConfiguracionSupabase) {
  root.render(
    <StrictMode>
      <EstadoInicioAplicacion
        titulo="Falta configurar el entorno local"
        descripcion="La interfaz está funcionando, pero necesita la URL y la clave pública de Supabase antes de iniciar una sesión."
        pasos={[
          'Inicia Supabase local desde la carpeta backend.',
          'Ejecuta npm run env:frontend en backend para generar frontend/.env.local.',
          'Reinicia el servidor de Vite con npm run dev.',
        ]}
      />
    </StrictMode>,
  )
} else {
  void import('./App.tsx')
    .then(({ default: App }) => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      )
    })
    .catch((error: unknown) => {
      console.error('No se pudo iniciar SILSANPLEX.', error)
      root.render(
        <StrictMode>
          <EstadoInicioAplicacion
            titulo="No se pudo iniciar la aplicación"
            descripcion="Ocurrió un error inesperado durante el arranque. Revisa la consola del navegador o vuelve a intentarlo."
            mostrarRecarga
          />
        </StrictMode>,
      )
    })
}
