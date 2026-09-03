(function () {
  const header = document.querySelector("[data-header]");
  const menuButton = document.querySelector("[data-menu-button]");
  const mobileNav = document.querySelector("[data-mobile-nav]");

  function updateHeader() {
    header?.classList.toggle("is-scrolled", window.scrollY > 8);
  }

  function closeMenu() {
    document.body.classList.remove("nav-open");
    mobileNav?.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  }

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  menuButton?.addEventListener("click", function () {
    const willOpen = !mobileNav?.classList.contains("open");
    document.body.classList.toggle("nav-open", willOpen);
    mobileNav?.classList.toggle("open", willOpen);
    menuButton.setAttribute("aria-expanded", String(willOpen));
  });

  mobileNav?.addEventListener("click", function (event) {
    if (event.target instanceof HTMLAnchorElement) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
})();
