# TABIRÁ ICES

Sitio web profesional para **TABIRÁ ICES** — empresa de venta de materiales de construcción e inmobiliaria en Puerto Escondido, Oaxaca.

Incluye sitio público + panel administrativo interno con cotizador protegido.

## 🎯 Características

### 🌐 Sitio Público
- ✅ **Página Principal** — Presentación de la empresa con hero section
- ✅ **Catálogo de Productos** — Bloques, tabiconas, postes para cercar, retroexcavadora
- ✅ **Área Inmobiliaria** — Venta de terrenos con asesoría profesional
- ✅ **Formulario de Contacto** — Conectado directo a WhatsApp
- ✅ **Botón "Acceso Interno"** — Link al login del panel administrativo
- ✅ **Responsive Design** — Optimizado para móvil, tablet y desktop

### 🔐 Panel Administrativo (Protegido con Login)
- ✅ **Cotizador Interno** — Calculadora en tiempo real
- ✅ **Generación de Cotizaciones** — Armado de presupuestos estructurados
- ✅ **Envío por WhatsApp** — Cotizaciones se envían directamente al cliente
- ✅ **Solo acceso autenticado** — Credenciales requeridas

## 📱 Rutas

| Página | Ruta | Tipo | Descripción |
|--------|------|------|-------------|
| Inicio | `/` | Público | Principal con presentación |
| Productos | `/productos.html` | Público | Catálogo completo + inmobiliaria |
| Contacto | `/contacto.html` | Público | Formulario de contacto |
| Login | `/login.html` | Público | Ingreso al panel administrativo |
| Cotizador | `/app/` | Privado | Calculadora de cotizaciones (requiere login) |

## 🔑 Credenciales (Cambiar en Producción)

**Demostración:**
- Usuario: `admin`
- Contraseña: `tabiraices2026`

⚠️ **En producción**, implementar autenticación segura con backend.

## 🛠️ Tech Stack

- **HTML5** — Semántico y accesible
- **Tailwind CSS** — Compilado en `assets/css/styles.css`
- **JavaScript Vanilla** — Sin dependencias externas
- **Responsive** — Mobile-first design
- **PWA** — `manifest.json` listo
- **Session Storage** — Verificación de login en cliente

## 🚀 Despliegue en Cloudflare Pages

### Paso 1: Conectar GitHub

1. Subir este repo a GitHub: `afernandezfalconi/TABIRAICES`
2. Ir a Cloudflare Pages
3. "Create a project" → Conectar GitHub
4. Seleccionar repositorio

### Paso 2: Configurar Build

- **Build command:** (dejar vacío - es estático)
- **Build output directory:** `/`
- **Environment variables:** (ninguno necesario)

### Paso 3: Deploy

```bash
git push origin main
```

Cloudflare Pages publicará automáticamente.

## 📝 Estructura del Proyecto

```
TABIRAICES/
├── index.html           # Inicio
├── productos.html       # Catálogo
├── contacto.html        # Contacto
├── login.html           # Login (protegido)
├── app/
│   └── index.html       # Cotizador (requiere login)
├── assets/
│   ├── css/styles.css   # Tailwind compilado
│   ├── js/site.js       # Scripts globales
│   └── img/             # Imágenes y logos
├── CLAUDE.md            # Guía técnica
├── manifest.json        # PWA
└── favicon.svg
```

## 📋 Checklist de Contenido

- [ ] Reemplazar números WhatsApp ficticios (5295812345671)
- [ ] Añadir fotos del Instagram a `assets/img/`
- [ ] Actualizar precios en cotizador (`app/index.html`)
- [ ] Configurar links reales de Instagram/Facebook
- [ ] Crear logo oficial en `assets/img/`
- [ ] Cambiar credenciales de login (usuario/contraseña)
- [ ] Implementar backend seguro para login (si es necesario)

## 📞 Información de Contacto

- **Ubicación:** Ventanilla, Colotepec, Puerto Escondido, Oaxaca
- **Instagram:** @tabiraices.ventanilla
- **Facebook:** facebook.com (actualizar)
- **WhatsApp:** +52 958 123 4567 (ACTUALIZAR)

## 🔗 URLs en Producción

- **Sitio Público:** `https://tabiraices.pages.dev` (o dominio personalizado)
- **Panel Admin:** Accesible desde `/login.html` en el mismo dominio

## 📄 Licencia

Uso exclusivo de TABIRÁ ICES
