import { formatStrftime, highlightFormat, specifiers, members, FormatError } from './formatter.js';
const segments = {
  modifier: { title: '修饰符', choices: [
    ['∅', '不加修饰符，按转换说明符的基本形式输出。'],
    ['E', '使用区域设置的替代表示，如年号纪年。只能用于 c、C、x、X、y、Y；区域设置没有替代表示时忽略，C 区域设置就是这样。'],
    ['O', '使用区域设置的替代数字符号或替代月份名。只能用于 b、B、d、e、H、I、m、M、S、u、U、V、w、W、y；C 区域设置下忽略。']
  ] },
  year: { title: '年份', choices: [
    ['Y', '完整年份，即 tm_year + 1900，如 2026。glibc 不补零，公元 999 年输出 999。'],
    ['y', '年份的末两位（00–99）。'],
    ['C', '年份除以 100 后向下取整，即世纪数（00–99）。2026 年输出 20。'],
    ['G', 'ISO 8601 周年。年初或年末的几天属于相邻年份的周时，周年与日历年份不同。常与 %V 搭配。'],
    ['g', 'ISO 8601 周年的末两位（00–99）。']
  ] },
  month: { title: '月份', choices: [
    ['m', '月份（01–12），即 tm_mon + 1。'],
    ['b', '月份缩写。C 区域设置为 Jan 到 Dec。'],
    ['B', '月份全称。C 区域设置为 January 到 December。'],
    ['h', '与 %b 相同。']
  ] },
  day: { title: '日期', choices: [
    ['d', '月内日期（01–31），一位数前补零。'],
    ['e', '月内日期（1–31），一位数前补空格。'],
    ['j', '年内第几天（001–366），即 tm_yday + 1。']
  ] },
  week: { title: '星期', choices: [
    ['a', '星期缩写。C 区域设置为 Sun 到 Sat。直接读取 tm_wday，不根据日期推算。'],
    ['A', '星期全称。C 区域设置为 Sunday 到 Saturday。'],
    ['u', 'ISO 8601 星期序号（1–7），星期一为 1。'],
    ['w', '星期序号（0–6），星期日为 0。'],
    ['U', '年内周数（00–53）。第一个星期日开始第 1 周，之前的日子属于第 0 周。'],
    ['W', '年内周数（00–53）。第一个星期一开始第 1 周，之前的日子属于第 0 周。'],
    ['V', 'ISO 8601 周数（01–53）。周一开始一周，包含 1 月 4 日的那周是第 1 周。']
  ] },
  time: { title: '时刻', choices: [
    ['H', '24 小时制的小时（00–23）。'],
    ['I', '12 小时制的小时（01–12）。'],
    ['M', '分钟（00–59）。'],
    ['S', '秒（00–60），60 用于闰秒。'],
    ['p', '上午或下午。C 区域设置为 AM 或 PM，12 点起为 PM。']
  ] },
  zone: { title: '时区', choices: [
    ['z', '与 UTC 的偏移，ISO 8601 格式，如 +0800。glibc 读取 tm_gmtoff 并舍去秒；tm_isdst 为负时不输出。'],
    ['Z', '时区名或缩写。glibc 输出 tm_zone；它为空且 tm_isdst 不为负时，改用 TZ 环境变量的时区名，这里是 UTC。']
  ] },
  composite: { title: '组合', choices: [
    ['c', '日期和时间。C 区域设置等同 %a %b %e %T %Y。'],
    ['x', '日期。C 区域设置等同 %m/%d/%y。'],
    ['X', '时间。C 区域设置等同 %T。'],
    ['D', '等同 %m/%d/%y。'],
    ['F', '等同 %Y-%m-%d，即 ISO 8601 日期格式。'],
    ['R', '等同 %H:%M。'],
    ['T', '等同 %H:%M:%S，即 ISO 8601 时间格式。'],
    ['r', '12 小时制时间。C 区域设置等同 %I:%M:%S %p。']
  ] },
  char: { title: '字符', choices: [
    ['n', '换行符。'],
    ['t', '水平制表符。'],
    ['%', '输出一个 %。']
  ] }
};
const formatInput = document.querySelector('#format-input');
const memberInputs = members.map(name => document.querySelector(`.member input[name="${name}"]`));
const memberCells = [...document.querySelectorAll('.member')];
const highlight = document.querySelector('#format-highlight');
const tokens = [...document.querySelectorAll('.token')];
const ruleTooltip = document.querySelector('#rule-tooltip');
const memberSources = () => Object.fromEntries(memberInputs.map(input => [input.name, input.value]));
let tooltipOwner = null;
let tooltipDismissTimer = null;
function markRead(names) { memberCells.forEach(cell => cell.classList.toggle('is-read', names.includes(cell.dataset.member))); }
function hideRuleTooltip() {
  clearTimeout(tooltipDismissTimer);
  ruleTooltip.hidden = true;
  tooltipOwner = null;
  markRead([]);
}
function positionRuleTooltip() {
  if (!tooltipOwner?.isConnected) return hideRuleTooltip();
  const ownerRect = tooltipOwner.getBoundingClientRect();
  const tooltipRect = ruleTooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - tooltipRect.width - 12, Math.max(12, ownerRect.left + ownerRect.width / 2 - tooltipRect.width / 2));
  const above = ownerRect.top - tooltipRect.height - 9;
  ruleTooltip.style.left = `${left}px`;
  ruleTooltip.style.top = `${above >= 12 ? above : ownerRect.bottom + 9}px`;
}
// The tooltip shows what the conversion produces for the current struct tm.
function sample(letter) {
  try { return `%${letter} → ${formatStrftime(`%${letter}`, memberSources()).text.replace(/\n/g, '\\n').replace(/\t/g, '\\t')}`; }
  catch { return null; }
}
function showRuleTooltip(owner, description, letter) {
  clearTimeout(tooltipDismissTimer);
  tooltipOwner = owner;
  ruleTooltip.replaceChildren(description);
  const line = letter && sample(letter);
  if (line) { const code = document.createElement('code'); code.className = 'rule-sample'; code.textContent = line; ruleTooltip.append(code); }
  markRead(letter ? specifiers[letter].reads : []);
  ruleTooltip.hidden = false;
  positionRuleTooltip();
}
function scheduleTooltipDismiss() {
  clearTimeout(tooltipDismissTimer);
  tooltipDismissTimer = setTimeout(() => {
    if (!tooltipOwner?.matches(':hover, :focus') && !ruleTooltip.matches(':hover')) hideRuleTooltip();
  }, 120);
}
ruleTooltip.addEventListener('pointerenter', () => clearTimeout(tooltipDismissTimer));
ruleTooltip.addEventListener('pointerleave', scheduleTooltipDismiss);
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideRuleTooltip(); });
window.addEventListener('resize', () => { if (!ruleTooltip.hidden) positionRuleTooltip(); });
window.addEventListener('scroll', hideRuleTooltip, {passive:true});
let active = 'year';
let displayedSegment = null;
function showSegment(key) {
  if (displayedSegment === key) return;
  displayedSegment = key;
  hideRuleTooltip();
  const segment = segments[key];
  document.querySelector('#inspector').style.setProperty('--segment-color', `var(--${key})`);
  document.querySelector('#segment-title').textContent = segment.title;
  document.querySelector('#choices').replaceChildren(...segment.choices.map(([value, description]) => {
    const el = document.createElement('button'); el.className = 'choice'; el.type = 'button';
    const code = document.createElement('code'); code.textContent = value;
    const letter = key === 'modifier' ? null : value;
    el.setAttribute('aria-label', value);
    el.setAttribute('aria-describedby', 'rule-tooltip');
    el.addEventListener('pointerenter', () => showRuleTooltip(el, description, letter));
    el.addEventListener('pointerleave', scheduleTooltipDismiss);
    el.addEventListener('focus', () => showRuleTooltip(el, description, letter));
    el.addEventListener('blur', scheduleTooltipDismiss);
    el.addEventListener('click', () => showRuleTooltip(el, description, letter));
    el.append(code); return el;
  }));
}
tokens.forEach(token => {
  token.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { showSegment(token.dataset.segment); token.classList.add('is-preview'); } });
  token.addEventListener('pointerleave', () => { token.classList.remove('is-preview'); showSegment(active); });
  token.addEventListener('focus', () => showSegment(token.dataset.segment));
  token.addEventListener('blur', () => showSegment(active));
  token.addEventListener('click', () => {
    active = token.dataset.segment;
    tokens.forEach(el => { el.classList.toggle('is-active', el === token); el.setAttribute('aria-pressed', String(el === token)); });
    showSegment(active);
  });
});
showSegment(active);
document.querySelector('#strftime-form').addEventListener('submit', event => event.preventDefault());
function updateOutput() {
  highlight.replaceChildren(...highlightFormat(formatInput.value).map(({text,part}) => {
    const span = document.createElement('span'); span.textContent = text;
    if (part) span.style.color = `var(--${part})`;
    return span;
  }));
  syncHighlightScroll();
  const output = document.querySelector('#output');
  const errorElement = document.querySelector('#output-error');
  const panel = document.querySelector('#output-panel');
  [formatInput, ...memberInputs].forEach(input => input.removeAttribute('aria-invalid'));
  try {
    const result = formatStrftime(formatInput.value, memberSources());
    output.replaceChildren(...result.spans.map(({text,part}) => {
      const span = document.createElement('span'); span.textContent = text; span.dataset.part = part;
      return span;
    }));
    output.hidden = false; errorElement.hidden = true; panel.classList.remove('has-error');
    return result;
  } catch (error) {
    output.textContent = ''; output.hidden = true; errorElement.hidden = false;
    errorElement.textContent = error instanceof FormatError ? error.message : '无法生成输出，请检查输入。';
    panel.classList.add('has-error');
    (memberInputs.find(input => input.name === error.field) ?? formatInput).setAttribute('aria-invalid', 'true');
    return {error:errorElement.textContent};
  }
}
[formatInput, ...memberInputs].forEach(input => input.addEventListener('input', updateOutput));
function syncHighlightScroll() { highlight.style.transform = `translateX(${-formatInput.scrollLeft}px)`; }
formatInput.addEventListener('scroll', syncHighlightScroll);
formatInput.addEventListener('keyup', syncHighlightScroll);
formatInput.addEventListener('click', syncHighlightScroll);
window.addEventListener('resize', syncHighlightScroll);
updateOutput();
// Feature detection keeps the same page usable in browsers without WebMCP.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const register = tool => { try { Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(() => {}); } catch {} };
  const memberSchema = Object.fromEntries(members.map(name => [name, {type:'string', maxLength:20000}]));
  register({name:'configure_strftime',description:'设置格式串和 struct tm 各成员（C 常量写法，tm_zone 用字符串字面量或 NULL），返回实时格式化结果。省略的成员保持页面当前值。',inputSchema:{type:'object',properties:{format:{type:'string',maxLength:20000},tm:{type:'object',properties:memberSchema,additionalProperties:false}},required:['format'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){
    if (!input || typeof input.format !== 'string' || input.format.length > 20000 || Object.keys(input).some(key => !['format','tm'].includes(key))) throw new Error('需要 format 字符串，可选 tm 对象。');
    const tm = input.tm ?? {};
    if (typeof tm !== 'object' || Object.entries(tm).some(([name, value]) => !members.includes(name) || typeof value !== 'string' || value.length > 20000)) throw new Error('tm 只能包含 struct tm 成员名，值为字符串。');
    formatInput.value = input.format;
    memberInputs.forEach(memberInput => { if (Object.hasOwn(tm, memberInput.name)) memberInput.value = tm[memberInput.name]; });
    const result = updateOutput();
    return result.error ? {error:result.error} : {output:result.text};
  }});
  window.addEventListener('pagehide',() => lifecycle.abort(),{once:true});
}
