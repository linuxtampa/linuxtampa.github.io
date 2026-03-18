(function() {
  const themeToggle = document.getElementById('theme-toggle');
  const themeToggleText = document.getElementById('theme-toggle-text');
  const html = document.documentElement;
  
  // Get saved theme or default to light
  const getTheme = () => {
    const saved = localStorage.getItem('theme');
    return saved || 'light';
  };
  
  // Set theme
  const setTheme = (theme) => {
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
      themeToggleText.textContent = 'Light';
      localStorage.setItem('theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
      themeToggleText.textContent = 'Dark';
      localStorage.setItem('theme', 'light');
    }
  };
  
  // Initialize theme on page load
  const currentTheme = getTheme();
  setTheme(currentTheme);
  
  // Toggle theme on button click
  themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });

  // Hide our toggle if Dark Reader is active — it's already doing the job
  const checkDarkReader = () => {
    const drActive = html.hasAttribute('data-darkreader-scheme');
    themeToggle.style.visibility = drActive ? 'hidden' : '';
  };

  checkDarkReader();

  new MutationObserver(checkDarkReader).observe(html, {
    attributes: true,
    attributeFilter: ['data-darkreader-scheme']
  });
})();

