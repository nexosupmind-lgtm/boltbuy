/* Presentation only: observes confirmed cart rendering, never changes orders. */
(() => {
  if (!document.body.classList.contains('delivery-shop')) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const dock = document.querySelector('.bottomnav');
  const count = document.getElementById('cartCount');
  let previous = Number(count?.textContent) || 0;
  let timeout;
  const feedback = document.createElement('div');
  feedback.className = 'buy-cart-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  document.body.append(feedback);
  if (count) new MutationObserver(() => {
    const current = Number(count.textContent) || 0;
    count.hidden = current === 0;
    if (current > previous) {
      feedback.textContent = '✓ Adicionado ao carrinho';
      feedback.classList.add('visible');
      clearTimeout(timeout);
      timeout = setTimeout(() => feedback.classList.remove('visible'), 2200);
      if (!reduced.matches) dock?.querySelector('[data-view="cart"] .buy-nav-icon')?.animate(
        [{transform:'scale(1)'},{transform:'scale(1.25) rotate(-8deg)'},{transform:'scale(1)'}],
        {duration:420,easing:'ease-out'});
    }
    previous = current;
  }).observe(count, {childList:true,characterData:true,subtree:true});
  if (count) count.hidden = previous === 0;
  const sync = () => dock?.querySelectorAll('[data-view]').forEach(button => {
    if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (dock) new MutationObserver(sync).observe(dock,{subtree:true,attributes:true,attributeFilter:['class']});
  sync();
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || !button.closest('.shop,.delivery-detail,.buy-dialog,#buy-profile') || reduced.matches || !button.animate) return;
    // Web Animations does not leave transient nodes in rerendered product cards.
    button.animate([{scale:'1'},{scale:'.95',offset:.35},{scale:'1.025',offset:.7},{scale:'1'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});
  });
  // Use the tenant's real catalog photography; no fabricated products or offers.
  const header = document.querySelector('.shophead');
  const catalogRoot = document.getElementById('categorySections');
  if (header && catalogRoot) {
    const cover = document.createElement('div');
    cover.className = 'buy-store-cover';
    cover.hidden = true;
    cover.setAttribute('aria-hidden', 'true');
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    cover.append(image);
    header.prepend(cover);
    image.onload = () => { cover.hidden = false; };
    image.onerror = () => { cover.hidden = true; };
    const refreshCover = () => {
      const source = window.BOLT_BUY_COVER || (typeof load === 'function' ? load().products?.find(product => product.active && product.photo)?.photo : null);
      if (!source) { cover.hidden = true; image.removeAttribute('src'); return; }
      if (image.getAttribute('src') !== source) { cover.hidden = true; image.src = source; }
    };
    new MutationObserver(refreshCover).observe(catalogRoot, {childList:true,subtree:true});
    window.addEventListener("buy-cover-ready",refreshCover);
    refreshCover();
  }
})();
