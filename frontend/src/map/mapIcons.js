/** Register small SDF-friendly map icons once per map instance. */
export function ensureOperationalMapIcons(map) {
  if (!map || map._removed) return;

  if (!map.hasImage('airport-icon-v2')) {
    addCanvasIcon(map, 'airport-icon-v2', drawAirportIcon);
  }
  if (!map.hasImage('bus-stop-icon-v2')) {
    addCanvasIcon(map, 'bus-stop-icon-v2', drawBusStopIcon);
  }
}

function addCanvasIcon(map, id, drawFn) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  drawFn(ctx, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  map.addImage(id, imageData, { pixelRatio: 2 });
}

function drawAirportIcon(ctx, size) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#0c4a6e';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#0284c7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(6, 18);
  ctx.lineTo(26, 18);
  ctx.lineTo(22, 14);
  ctx.lineTo(26, 10);
  ctx.lineTo(16, 10);
  ctx.lineTo(12, 6);
  ctx.lineTo(10, 10);
  ctx.lineTo(6, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawBusStopIcon(ctx, size) {
  ctx.clearRect(0, 0, size, size);

  // Pin / marker base
  ctx.fillStyle = '#1d4ed8';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2 - 1, size / 2 - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Simple bus body
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(8, 11, 16, 10);
  ctx.fillStyle = '#93c5fd';
  ctx.fillRect(10, 13, 4, 4);
  ctx.fillRect(18, 13, 4, 4);

  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.arc(11, 22, 2.2, 0, Math.PI * 2);
  ctx.arc(21, 22, 2.2, 0, Math.PI * 2);
  ctx.fill();
}
