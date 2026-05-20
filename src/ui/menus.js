/** Topbar File/Edit/Export menus — close on mouse leave and item click. */
export function initMenuDropdowns() {
  const menus = document.querySelectorAll('.menu-bar .menu');
  if (!menus.length) return;

  menus.forEach((menu) => {
    menu.addEventListener('mouseleave', (e) => {
      if (e.relatedTarget instanceof Node && menu.contains(e.relatedTarget)) return;
      menu.open = false;
    });

    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      menus.forEach((other) => {
        if (other !== menu) other.open = false;
      });
    });

    menu.querySelectorAll('.menu-pop button').forEach((btn) => {
      btn.addEventListener('click', () => {
        menu.open = false;
      });
    });
  });

  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.menu-bar .menu')) return;
    menus.forEach((menu) => {
      menu.open = false;
    });
  });
}
