/* Markdown is kept in a repository so new pages can be published without editing this HTML. */
const CONTENT = {
  owner: 'Cosmos-81',
  repo: 'cosmos-81.github.io',
  branch: 'main',
  path: 'content/pages',
  manifest: 'content/index.json'
};

const apiUrl = `https://api.github.com/repos/${CONTENT.owner}/${CONTENT.repo}/contents/${CONTENT.path}?ref=${CONTENT.branch}`;
const contentApiUrl = (path) => `https://api.github.com/repos/${CONTENT.owner}/${CONTENT.repo}/contents/${path}?ref=${CONTENT.branch}`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

function parseMarkdown(markdown) {
  const frontmatter = {};
  let body = markdown.trim();
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3);
    if (end !== -1) {
      body.slice(3, end).trim().split('\n').forEach((line) => {
        const separator = line.indexOf(':');
        if (separator > 0) frontmatter[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
      });
      body = body.slice(end + 4).trim();
    }
  }
  return { frontmatter, body };
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>');
}

function renderList(items) {
  const roots = [];
  const stack = [];
  items.forEach(({ indent, text }) => {
    const item = { text, children: [] };
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    if (stack.length) stack[stack.length - 1].item.children.push(item);
    else roots.push(item);
    stack.push({ indent, item });
  });
  const renderItems = (nodes) => `<ul>${nodes.map((item) => `
    <li>${inlineMarkdown(item.text)}${item.children.length ? renderItems(item.children) : ''}</li>`).join('')}</ul>`;
  return renderItems(roots);
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const listItem = line.match(/^(\s*)-\s+(.+)$/);
    if (line.startsWith('### ')) {
      html.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      html.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
    } else if (listItem) {
      const items = [];
      while (index < lines.length) {
        const nestedItem = lines[index].match(/^(\s*)-\s+(.+)$/);
        if (!nestedItem) break;
        items.push({ indent: nestedItem[1].replace(/\t/g, '  ').length, text: nestedItem[2] });
        index += 1;
      }
      index -= 1;
      html.push(renderList(items));
    } else if (line.trim()) {
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }
  return html.join('');
}

async function fetchMarkdown(path) {
  const localResponse = await fetch(path);
  if (localResponse.ok) return parseMarkdown(await localResponse.text());

  const response = await fetch(contentApiUrl(path));
  if (!response.ok) throw new Error(`Markdownの取得に失敗しました (${response.status})`);
  const file = await response.json();
  return parseMarkdown(decodeURIComponent(escape(window.atob(file.content.replace(/\n/g, '')))));
}

async function fetchFileList(path) {
  const localResponse = await fetch(CONTENT.manifest);
  if (localResponse.ok) {
    const manifest = await localResponse.json();
    const paths = manifest[path];
    if (!Array.isArray(paths)) throw new Error(`Markdown一覧が見つかりません: ${path}`);
    return paths.map((filePath) => ({ path: filePath, name: filePath.split('/').pop() }));
  }

  const response = await fetch(path === CONTENT.path ? apiUrl : contentApiUrl(path));
  if (!response.ok) throw new Error(`Markdown一覧の取得に失敗しました (${response.status})`);
  return (await response.json()).filter((file) => file.name.endsWith('.md'));
}

async function loadContent() {
  const list = document.querySelector('#page-list');
  try {
    const files = await fetchFileList(CONTENT.path);
    if (!files.length) {
      list.innerHTML = '<p class="loading">まだページがありません。</p>';
      return;
    }
    const pages = (await Promise.all(files.map(async (file) => {
      try {
        return { file, ...(await fetchMarkdown(file.path)) };
      } catch (error) {
        console.error(`Markdownをスキップしました: ${file.path}`, error);
        return null;
      }
    }))).filter(Boolean);
    if (!pages.length) {
      list.innerHTML = '<p class="loading">まだページがありません。</p>';
      return;
    }
    list.innerHTML = pages.map(({ file, frontmatter, body }) => `
      <a class="tile" href="${escapeHtml(frontmatter.url || `#page/${encodeURIComponent(file.path)}`)}">
        <div><span class="tile-kicker">${escapeHtml(frontmatter.category || 'NOTE')}</span>
        <h3>${escapeHtml(frontmatter.title || file.name.replace('.md', ''))}</h3>
        <p>${escapeHtml(frontmatter.description || body.split('\n').find(Boolean) || '')}</p></div>
        <span class="tile-arrow">↗</span>
      </a>`).join('');
  } catch (error) {
    list.innerHTML = '<p class="loading">ページを読み込めませんでした。時間をおいて再度お試しください。</p>';
    console.error(error);
  }
}

async function loadCollection(path, target) {
  try {
    const files = await fetchFileList(path);
    const entries = (await Promise.all(files.map(async (file) => {
      try {
        return { file, ...(await fetchMarkdown(file.path)) };
      } catch (error) {
        console.error(`Markdownをスキップしました: ${file.path}`, error);
        return null;
      }
    }))).filter(Boolean);
    document.querySelector(target).innerHTML = entries.map(({ file, frontmatter, body }) => `
      <a class="tile" href="#page/${encodeURIComponent(file.path)}">
        <div><span class="tile-kicker">${escapeHtml(frontmatter.category || 'NOTE')}</span>
        <h3>${escapeHtml(frontmatter.title || file.name.replace('.md', ''))}</h3>
        <p>${escapeHtml(frontmatter.description || body.split('\n').find(Boolean) || '')}</p></div>
        <span class="tile-arrow">↗</span>
      </a>`).join('');
  } catch (error) {
    document.querySelector(target).innerHTML = '<p class="loading">Markdownを読み込めませんでした。</p>';
    console.error(error);
  }
}

function setupNavigation() {
  const menu = document.querySelector('.site-menu');
  document.querySelector('.menu-toggle').addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    document.querySelector('.menu-toggle').setAttribute('aria-expanded', String(isOpen));
  });
  const updateActive = () => {
    const hash = window.location.hash.slice(1);
    const route = hash.startsWith('page/') ? 'pages' : (hash || 'home');
    document.querySelectorAll('[data-route]').forEach((link) => link.classList.toggle('active', link.dataset.route === route));
    menu.classList.remove('open');
  };
  window.addEventListener('hashchange', updateActive);
  updateActive();
}

function setupXTimeline() {
  const timeline = document.querySelector('.twitter-timeline');
  if (!timeline) return;
  let attempts = 0;
  const loadWidget = () => {
    if (window.twttr?.widgets) {
      window.twttr.widgets.load(timeline.parentElement);
      return;
    }
    if (attempts < 20) {
      attempts += 1;
      window.setTimeout(loadWidget, 250);
    }
  };
  const widgetScript = document.querySelector('script[src="https://platform.x.com/widgets.js"]');
  widgetScript?.addEventListener('load', loadWidget);
  loadWidget();
}

async function showPageDetail() {
  const hash = window.location.hash.slice(1);
  const detail = document.querySelector('#page-detail');
  const sections = document.querySelectorAll('main > section');
  if (!hash.startsWith('page/')) {
    document.body.classList.remove('detail-mode');
    detail.hidden = true;
    sections.forEach((section) => { if (section.id !== 'page-detail') section.hidden = false; });
    return;
  }
  const path = decodeURIComponent(hash.slice(5));
  if (!/^content\/(?:pages|motorcycle|movie)\/[\w.-]+\.md$/.test(path)) return;
  document.body.classList.add('detail-mode');
  sections.forEach((section) => { section.hidden = section.id === 'page-detail' ? false : true; });
  window.scrollTo(0, 0);
  document.querySelector('#page-detail-content').innerHTML = '<p class="loading">読み込んでいます…</p>';
  try {
    const { frontmatter, body } = await fetchMarkdown(path);
    document.querySelector('#page-detail-category').textContent = frontmatter.category || 'NOTE';
    document.querySelector('#page-detail-title').textContent = frontmatter.title || path.split('/').pop().replace('.md', '');
    document.querySelector('#page-detail-content').innerHTML = markdownToHtml(body);
  } catch (error) {
    document.querySelector('#page-detail-content').innerHTML = '<p class="loading">ページを読み込めませんでした。</p>';
    console.error(error);
  }
}

setupNavigation();
window.addEventListener('hashchange', showPageDetail);
showPageDetail();
loadContent();
loadCollection('content/motorcycle', '#motorcycle-content');
loadCollection('content/movie', '#movie-content');
setupXTimeline();
