/* Paso de hojas según dónde se agarre la hoja (sobre page-flip 2.0.7).
   Tercio superior: se dobla la esquina de arriba. Tercio inferior: la de abajo.
   Tercio del medio: se toma el borde por el centro y el papel se dobla en una línea casi vertical,
   con la misma curva, luz y sombra que en las esquinas.
   La hoja no salta al dedo: se conserva la distancia entre el punto agarrado y el borde.
   Uso: hojasPorZona(pf, contenedor, () => escala) */
(function (global) {
  'use strict';
  function hojasPorZona(pf, host, escala) {
    var fc = pf.flipController, render = pf.getRender();
    var R = function () { return render.getRect(); };
    var esc = typeof escala === 'function' ? escala : function () { return 1; };
    var zona = null, toque = null, desf = null, ultimo = null;

    function zonaEn(y) {
      var r = R(), t = (y - r.top) / r.height;
      return t < 1 / 3 ? 'top' : t > 2 / 3 ? 'bottom' : 'mid';
    }
    function posLibro(cx, cy) {
      var b = pf.getUI().getDistElement().getBoundingClientRect(), s = esc() || 1;
      return { x: (cx - b.left) / s, y: (cy - b.top) / s };
    }
    // El libro puede estar reducido con CSS (pantallas chicas): las coordenadas del dedo se corrigen por esa escala
    var ui = pf.getUI();
    ui.getMousePos = posLibro;
    function baja(cx, cy) { toque = posLibro(cx, cy); zona = zonaEn(toque.y); desf = null; }
    host.addEventListener('mousedown', function (e) { baja(e.clientX, e.clientY); }, true);
    host.addEventListener('touchstart', function (e) {
      var t = e.changedTouches[0]; if (t) baja(t.clientX, t.clientY);
    }, { capture: true, passive: true });
    // Un toque fuera del libro (botones, menú) olvida la zona: las flechas pasan la hoja por la esquina
    document.addEventListener('pointerdown', function (e) { if (!host.contains(e.target)) { zona = null; toque = null; } }, true);

    // Hacia atrás si se tomó la mitad izquierda (dos páginas) o el borde izquierdo (una página)
    function haciaAtras(p) {
      var r = R();
      if (pf.getOrientation() === 'portrait') return p.x - r.left - r.pageWidth <= r.width / 5;
      return p.x < r.left + r.width / 2;
    }
    // Altura del punto que guía el doblez en la zona del medio: el borde superior,
    // con una leve inclinación que sigue al dedo para que el papel no se vea rígido
    function yMedio(p) {
      var r = R(), d = toque ? (p.y - toque.y) * 0.18 : 0;
      return r.top + Math.max(0.5, Math.min(r.height * 0.06, d + 0.5));
    }

    var plegar = fc.fold.bind(fc);
    fc.fold = function (p) {
      if (toque && fc.calc === null) {
        var r = R(), atras = haciaAtras(toque);
        var bx = atras ? r.left : r.left + r.width;
        var by = zona === 'bottom' ? r.top + r.height - 0.5 : r.top + 0.5;
        desf = { x: bx - toque.x, y: by - toque.y };
      }
      if (!desf) return plegar(p);
      var r2 = R(), x = p.x + desf.x;
      // En una sola página (celular vertical) la hoja anterior está fuera de la pantalla y el lomo es el borde izquierdo:
      // el borde de la hoja avanza el doble que el dedo, así media página de recorrido basta para pasarla
      if (pf.getOrientation() === 'portrait') {
        var atras2 = haciaAtras(toque);
        x = atras2 ? r2.left + 2 * Math.max(0, p.x - toque.x) : r2.left + r2.width - 2 * Math.max(0, toque.x - p.x);
      }
      ultimo = p;
      var y = zona === 'mid' ? yMedio(p)
        : Math.max(r2.top + 0.5, Math.min(r2.top + r2.height - 0.5, p.y + desf.y));
      plegar({ x: x, y: y });
    };

    // Al soltar: si el dedo recorrió al menos una cuarta parte de la página hacia donde iba, la hoja termina de pasar
    // (como un empujón); si no, regresa a su lugar
    var soltar = fc.stopMove.bind(fc);
    fc.stopMove = function () {
      var c = fc.calc;
      if (c && toque && ultimo) {
        var r = R(), atras = c.getDirection() === 1;
        var d = atras ? ultimo.x - toque.x : toque.x - ultimo.x;
        if (d > r.pageWidth * 0.25) {
          var pos = c.getPosition(), y = c.getCorner() === 'bottom' ? r.height : 0;
          return fc.animateFlippingTo(pos, { x: -r.pageWidth, y: y }, true);
        }
      }
      soltar();
    };

    // Giro animado completo desde el medio del borde (toque breve o deslizar rápido)
    function giroMedio(adelante) {
      var r = R();
      if (fc.calc !== null) render.finishAnimation();
      var x0 = adelante ? r.left + r.width - 2 : r.left + 2;
      if (!fc.start({ x: x0, y: r.top + 0.5 })) return;
      fc.setState('flipping');
      var pw = r.pageWidth, a = { x: pw - 2, y: 0.5 };
      fc.calc.calc(a);
      fc.animateFlippingTo(a, { x: -pw, y: 0 }, true);
    }
    var girar = fc.flip.bind(fc);
    fc.flip = function (p) {
      if (zona === 'mid' && toque) return giroMedio(!haciaAtras(p));
      girar(p);
    };
    var sig = pf.flipNext.bind(pf), ant = pf.flipPrev.bind(pf);
    pf.flipNext = function (c) {
      if (zona === 'mid' && toque) return giroMedio(true);
      sig(zona === 'bottom' || zona === 'top' ? zona : (c || 'top'));
    };
    pf.flipPrev = function (c) {
      if (zona === 'mid' && toque) return giroMedio(false);
      ant(zona === 'bottom' || zona === 'top' ? zona : (c || 'top'));
    };
    pf.on('changeState', function (e) {
      if (e.data === 'read') { zona = null; toque = null; desf = null; ultimo = null; }
    });
  }
  global.hojasPorZona = hojasPorZona;
})(window);
