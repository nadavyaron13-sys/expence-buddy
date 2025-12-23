// Minimal shadcn-like UI primitives using Tailwind classes
// Functions return DOM nodes ready to append.

function uiButton(text, opts = {}) {
  const btn = document.createElement('button');
  btn.type = opts.type || 'button';
  const classes = [
    'inline-flex', 'items-center', 'justify-center',
    'rounded-md', 'px-3', 'py-2', 'text-sm', 'font-medium',
    'shadow-sm', 'border', 'border-transparent',
    'bg-primary', 'text-white', 'hover:bg-primary-600',
    'focus:outline-none', 'focus:ring-2', 'focus:ring-offset-2', 'focus:ring-primary-500'
  ];
  if (opts.variant === 'ghost') {
    classes.splice(0, classes.length, 'inline-flex','items-center','justify-center','px-2','py-1','text-sm','rounded-md','hover:bg-gray-100');
  }
  btn.className = classes.join(' ');
  btn.textContent = text;
  if (opts.onClick) btn.addEventListener('click', opts.onClick);
  return btn;
}

function uiInput(placeholder = '', opts = {}) {
  const input = document.createElement('input');
  input.type = opts.type || 'text';
  input.placeholder = placeholder;
  input.className = 'block w-full rounded-md border px-3 py-2 text-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500';
  if (opts.value) input.value = opts.value;
  return input;
}

function uiCard(content) {
  const el = document.createElement('div');
  el.className = 'card bg-white p-4 rounded-md shadow-sm';
  if (typeof content === 'string') el.innerHTML = content;
  else if (content instanceof Node) el.appendChild(content);
  else if (Array.isArray(content)) content.forEach(c => el.appendChild(c));
  return el;
}

function uiDialog(title, bodyNodes = [], opts = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50';

  const panel = document.createElement('div');
  panel.className = 'bg-white rounded-lg shadow-lg w-full max-w-lg mx-4';

  const header = document.createElement('div');
  header.className = 'px-4 py-3 border-b';
  header.textContent = title;

  const body = document.createElement('div');
  body.className = 'p-4';
  bodyNodes.forEach(n => body.appendChild(n));

  const footer = document.createElement('div');
  footer.className = 'px-4 py-3 border-t flex justify-end gap-2';
  const close = uiButton('Close', { onClick: () => overlay.remove(), variant: 'ghost' });
  footer.appendChild(close);

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);
  overlay.appendChild(panel);
  return overlay;
}

// Expose to global for simple integration with vanilla app
window.ui = { Button: uiButton, Input: uiInput, Card: uiCard, Dialog: uiDialog };
