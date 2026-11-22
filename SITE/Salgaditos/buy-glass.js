/* Interaction feedback only; persistence and permissions remain in their owners. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const admin = document.body.classList.contains('buy-admin-app');
  if (!admin && !document.body.classList.contains('delivery-shop')) return;
  const animate = (element, frames, duration = 300) => {
    if (!reduced.matches && element?.animate) element.animate(frames, {duration, easing:'cubic-bezier(.2,.8,.2,1)'});
  };
  // Shop buttons already receive touch feedback from buy-delight.js.
  if (admin) document.addEventListener('click', event => {
    const button = event.target.closest('button,.btn');
    if (!button || button.disabled) return;
    animate(button, [{scale:1},{scale:.95},{scale:1}], 240);
  });
  const root = document.querySelector(admin ? '.main' : '.shopmain');
  if (root) new MutationObserver(records => {
    for (const record of records) {
      const target = record.target;
      if (record.oldValue?.split(' ').includes('hide') && !target.classList.contains('hide')) {
        animate(target, [{opacity:.4,translate:'0 10px'},{opacity:1,translate:'0 0'}]);
      }
    }
  }).observe(root, {subtree:true,attributes:true,attributeFilter:['class'],attributeOldValue:true});
  if (admin) {
    const markToast = () => {
      const toast = document.getElementById('toast');
      if (toast && !toast.hasAttribute('role')) {
        toast.setAttribute('role','status');
        toast.setAttribute('aria-live','polite');
        toast.setAttribute('aria-atomic','true');
      }
    };
    markToast();
    new MutationObserver(markToast).observe(document.body,{childList:true});
    window.addEventListener('buy-product-saved', () => {
      const form = document.getElementById('productForm');
      animate(form, [{opacity:.65},{opacity:1}], 350);
      const panel = form?.closest('.panel');
      if (panel && !reduced.matches) {
        panel.classList.remove('buy-save-success');
        void panel.offsetWidth;
        panel.classList.add('buy-save-success');
        setTimeout(() => panel.classList.remove('buy-save-success'),700);
      }
    });
  }
})();
