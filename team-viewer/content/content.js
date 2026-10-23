// Team Viewer — Content Script
// ทำงานบนทุกหน้าเว็บ รับคำสั่งจาก background

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'PING':
      sendResponse({ pong: true, url: location.href });
      break;

    case 'GET_PAGE_INFO':
      sendResponse({
        title: document.title,
        url: location.href,
        forms: document.querySelectorAll('form').length,
        links: document.querySelectorAll('a').length,
        images: document.querySelectorAll('img').length
      });
      break;

    case 'HIGHLIGHT_ELEMENT':
      highlightElement(msg.selector);
      sendResponse({ success: true });
      break;

    case 'FILL_FORM':
      fillForm(msg.selector, msg.value);
      sendResponse({ success: true });
      break;

    case 'CLICK_ELEMENT':
      clickElement(msg.selector);
      sendResponse({ success: true });
      break;

    case 'GET_TEXT':
      sendResponse({ text: document.body?.innerText?.substring(0, 5000) || '' });
      break;

    case 'SCROLL_TO':
      window.scrollTo({ top: msg.y || 0, behavior: 'smooth' });
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: 'Unknown command' });
  }
  return true;
});

function highlightElement(selector) {
  const el = document.querySelector(selector);
  if (el) {
    el.style.outline = '3px solid #3b82f6';
    el.style.outlineOffset = '2px';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function fillForm(selector, value) {
  const el = document.querySelector(selector);
  if (el) {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function clickElement(selector) {
  const el = document.querySelector(selector);
  if (el) el.click();
}

// Notify that content script is ready
console.log('[Team Viewer] Content script loaded on', location.href);
