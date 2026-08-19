(function () {
  var current = 0;

  // Generate dots from slides
  var slides = document.querySelectorAll('.carousel-slide');
  var dotsContainer = document.querySelector('.carousel-dots');
  if (dotsContainer && slides.length) {
    dotsContainer.innerHTML = '';
    slides.forEach(function (_, i) {
      var dot = document.createElement('span');
      dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      dot.onclick = function () { carouselGoTo(i); };
      dotsContainer.appendChild(dot);
    });
  }

  function update() {
    var track = document.querySelector('.carousel-track');
    var dots = document.querySelectorAll('.carousel-dot');
    if (!track) return;
    track.style.transform = 'translateX(-' + (current * 100) + '%)';
    dots.forEach(function (d, i) {
      d.classList.toggle('active', i === current);
    });
  }

  window.carouselMove = function (dir) {
    current = (current + dir + slides.length) % slides.length;
    update();
  };

  window.carouselGoTo = function (index) {
    current = index;
    update();
  };

  // Auto-advance every 5 seconds
  setInterval(function () { window.carouselMove(1); }, 5000);
})();
