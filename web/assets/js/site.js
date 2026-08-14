/* Soluciones Puerto — comportamiento del sitio público.
   Cada bloque comprueba que su elemento exista, así el mismo archivo
   sirve para todas las páginas. */

import { api } from '../../app/api.js';

(function () {
  'use strict';

  var WHATSAPP = '5219987626189';

  /* ---------- Menú móvil ---------- */
  var btn = document.getElementById('menu-btn');
  var menu = document.getElementById('menu-movil');
  if (btn && menu) {
    btn.addEventListener('click', function () {
      var abierto = menu.classList.toggle('hidden') === false;
      btn.setAttribute('aria-expanded', String(abierto));
      btn.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
    });
  }

  /* ---------- Año del footer ---------- */
  var anios = document.querySelectorAll('[data-anio]');
  for (var i = 0; i < anios.length; i++) {
    anios[i].textContent = String(new Date().getFullYear());
  }

  /* ---------- Filtro del portafolio ---------- */
  var filtros = document.querySelectorAll('[data-filtro]');
  var proyectos = document.querySelectorAll('[data-categoria]');
  if (filtros.length && proyectos.length) {
    for (var f = 0; f < filtros.length; f++) {
      filtros[f].addEventListener('click', function () {
        var cat = this.getAttribute('data-filtro');

        for (var j = 0; j < filtros.length; j++) {
          var activo = filtros[j] === this;
          filtros[j].classList.toggle('bg-brand', activo);
          filtros[j].classList.toggle('text-white', activo);
          filtros[j].classList.toggle('bg-white', !activo);
          filtros[j].classList.toggle('text-muted', !activo);
          filtros[j].setAttribute('aria-pressed', String(activo));
        }

        for (var k = 0; k < proyectos.length; k++) {
          var coincide = cat === 'todos' || proyectos[k].getAttribute('data-categoria') === cat;
          proyectos[k].classList.toggle('hidden', !coincide);
        }
      });
    }
  }

  /* ---------- Formulario de contacto ----------
     Doble red para que ningún lead se pierda:
       1. se registra en el backend (POST /api/leads), que es lo que
          alimenta la pestaña Leads del panel
       2. se abre WhatsApp con el mensaje ya armado
     Si el backend falla —sin señal, Worker caído— NO se bloquea al
     visitante: WhatsApp se abre igual. Perder el lead sería peor que
     no registrarlo. */
  var form = document.getElementById('form-contacto');
  if (form) {
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();

      /* Honeypot: si un bot rellena el campo oculto, no hacemos nada
         visible y lo damos por enviado. */
      var trampa = form.querySelector('[name="web_url"]');
      if (trampa && trampa.value) {
        window.location.href = 'gracias.html';
        return;
      }

      var datos = new FormData(form);
      var v = function (campo) { return (datos.get(campo) || '').toString().trim(); };

      var texto = '*Solicitud desde la web — Soluciones Puerto*\n\n' +
        '*Nombre:* ' + v('nombre') + '\n' +
        '*Teléfono:* ' + v('telefono');
      if (v('email'))    { texto += '\n*Email:* ' + v('email'); }
      if (v('servicio')) { texto += '\n*Servicio:* ' + v('servicio'); }
      texto += '\n\n*Mensaje:*\n' + v('mensaje');

      var boton = form.querySelector('button[type="submit"]');
      if (boton) { boton.disabled = true; boton.textContent = 'Enviando…'; }

      try {
        await api.enviarLead({
          nombre: v('nombre'), telefono: v('telefono'), email: v('email'),
          servicio: v('servicio'), mensaje: v('mensaje'),
          origen: window.location.pathname,
        });
      } catch (e) {
        // No se interrumpe al visitante: se sigue a WhatsApp.
        console.error('[lead] no se pudo registrar en el servidor', e);
      }

      var url = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(texto);
      var ventana = window.open(url, '_blank', 'noopener');
      if (!ventana) { window.location.href = url; return; }

      window.location.href = 'gracias.html';
    });
  }
})();
