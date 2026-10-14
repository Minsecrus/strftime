// C strftime teaching model: C23 "C" locale on x86-64 Linux (glibc, TZ=UTC), UTF-8 literals.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');
const MAX_OUTPUT = 20000;
export class FormatError extends Error {
  constructor(message, field = 'format') { super(message); this.field = field; }
}
const standardMembers = ['tm_year','tm_mon','tm_mday','tm_hour','tm_min','tm_sec','tm_wday','tm_yday','tm_isdst'];
// glibc and POSIX.1-2024 add tm_gmtoff and tm_zone, which %z and %Z read.
export const members = [...standardMembers,'tm_gmtoff','tm_zone'];
const ranges = {tm_sec:[0,60],tm_min:[0,59],tm_hour:[0,23],tm_mday:[1,31],tm_mon:[0,11],tm_wday:[0,6],tm_yday:[0,365]};
const specifier = (category, reads, expansion) => ({category,reads,expansion});
// Members follow the brackets in C23 7.29.3.5; expansions are the "C" locale replacements.
export const specifiers = {
  Y:specifier('year',['tm_year']),y:specifier('year',['tm_year']),C:specifier('year',['tm_year']),
  G:specifier('year',['tm_year','tm_wday','tm_yday']),g:specifier('year',['tm_year','tm_wday','tm_yday']),
  m:specifier('month',['tm_mon']),b:specifier('month',['tm_mon']),B:specifier('month',['tm_mon']),h:specifier('month',['tm_mon']),
  d:specifier('day',['tm_mday']),e:specifier('day',['tm_mday']),j:specifier('day',['tm_yday']),
  a:specifier('week',['tm_wday']),A:specifier('week',['tm_wday']),u:specifier('week',['tm_wday']),w:specifier('week',['tm_wday']),
  U:specifier('week',['tm_year','tm_wday','tm_yday']),W:specifier('week',['tm_year','tm_wday','tm_yday']),V:specifier('week',['tm_year','tm_wday','tm_yday']),
  H:specifier('time',['tm_hour']),I:specifier('time',['tm_hour']),M:specifier('time',['tm_min']),S:specifier('time',['tm_sec']),p:specifier('time',['tm_hour']),
  z:specifier('zone',['tm_isdst','tm_gmtoff']),Z:specifier('zone',['tm_isdst','tm_zone']),
  c:specifier('composite',standardMembers,'%a %b %e %T %Y'),x:specifier('composite',standardMembers,'%m/%d/%y'),X:specifier('composite',standardMembers,'%T'),
  D:specifier('composite',['tm_mon','tm_mday','tm_year'],'%m/%d/%y'),F:specifier('composite',['tm_year','tm_mon','tm_mday'],'%Y-%m-%d'),
  R:specifier('composite',['tm_hour','tm_min'],'%H:%M'),T:specifier('composite',['tm_hour','tm_min','tm_sec'],'%H:%M:%S'),
  r:specifier('composite',['tm_hour','tm_min','tm_sec'],'%I:%M:%S %p'),
  n:specifier('char',[]),t:specifier('char',[]),'%':specifier('char',[])
};
const modifiers = {E:'cCxXyY',O:'bBdeHImMSuUVwWy'};
const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const simpleEscapes = {n:10,r:13,t:9,b:8,f:12,v:11,a:7,'\\':92,'"':34,"'":39,'?':63};
function decodeLiteral(body, field, quote) {
  const bytes = [];
  for (let index = 0; index < body.length;) {
    let codePoint;
    if (body[index] === '\\') {
      const match = /^\\(?:([0-7]{1,3})|x([\da-fA-F]+)|u([\da-fA-F]{4})|U([\da-fA-F]{8})|(.))/su.exec(body.slice(index));
      if (!match) throw new FormatError('转义序列不完整。', field);
      const [escape,octal,hex,short,long,other] = match;
      index += escape.length;
      if (octal || hex) {
        const value = BigInt(octal ? '0o' + octal : '0x' + hex);
        if (value > 0xffn) throw new FormatError(`转义序列 ${escape} 超出范围。`, field);
        bytes.push(Number(value)); continue;
      }
      codePoint = other === undefined ? parseInt(short ?? long, 16) : simpleEscapes[other];
      if (codePoint === undefined) throw new FormatError(`无效的转义序列 ${escape}。`, field);
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) throw new FormatError(`通用字符名 ${escape} 无效。`, field);
    } else {
      if (body[index] === quote) throw new FormatError(`字符串中的 ${quote} 需要写成 \\${quote}。`, field);
      codePoint = body.codePointAt(index); index += codePoint > 0xffff ? 2 : 1;
    }
    bytes.push(...encoder.encode(String.fromCodePoint(codePoint)));
  }
  return bytes;
}
// Adjacent plain string literals, concatenated as in translation phase 6.
function stringLiterals(source, field, message) {
  if (!/^\s*(?:"(?:[^"\\]|\\.)*"\s*)+$/su.test(source)) throw new FormatError(message, field);
  return [...source.matchAll(/"((?:[^"\\]|\\.)*)"/gsu)].flatMap(match => decodeLiteral(match[1],field));
}
function formatLiteral(source) {
  const bytes = /^\s*"/.test(source) ? stringLiterals(source,'format','格式串需要由完整的普通字符串字面量组成。') : decodeLiteral(source,'format','"');
  const end = bytes.indexOf(0);
  return end < 0 ? bytes : bytes.slice(0,end);
}
const integerPattern = /^(?:0[xX]([\da-fA-F](?:'?[\da-fA-F])*)|0[bB]([01](?:'?[01])*)|(0(?:'?[0-7])*)|([1-9](?:'?\d)*))([uU])?(ll|LL|[lL])?([uU])?$/;
// An int or long member initialized from a constant: the constant needs a type, then converts modulo 2^N as GCC does.
function integerMember(source, bits) {
  const [,sign = '',text = ''] = /^([+-]?)\s*(.*)$/s.exec(source);
  if (!text) { if (sign) throw new Error(`${source} 不是整数常量。`); return 0n; }
  const match = integerPattern.exec(text);
  if (!match || (match[5] && match[7])) throw new Error(`${text} 不是整数常量。`);
  const digits = (match[1] ?? match[2] ?? match[3] ?? match[4]).replace(/'/g, '');
  const value = match[1] ? BigInt('0x' + digits) : match[2] ? BigInt('0b' + digits) : match[3] ? BigInt('0o' + (digits.slice(1) || '0')) : BigInt(digits);
  const unsigned = Boolean(match[5] || match[7]), size = (match[6] ?? '').toLowerCase();
  const widths = [32,64,64].slice(size === 'll' ? 2 : size === 'l' ? 1 : 0);
  const fits = widths.some(width => value < 1n << BigInt(unsigned ? width : width - 1) || (!unsigned && !match[4] && value < 1n << BigInt(width)));
  if (!fits) throw new Error(`整数常量 ${text} 超出所有可用类型的范围。`);
  return BigInt.asIntN(bits,sign === '-' ? -value : value);
}
function zoneMember(source) {
  if (['','NULL','nullptr','0'].includes(source)) return null;
  const bytes = stringLiterals(source,'tm_zone','需要字符串字面量或 NULL。'), end = bytes.indexOf(0);
  return end < 0 ? bytes : bytes.slice(0,end);
}
function parseMembers(sources) {
  const tm = {};
  for (const name of members) {
    const source = String(sources[name] ?? '').trim();
    try { tm[name] = name === 'tm_zone' ? zoneMember(source) : name === 'tm_gmtoff' ? integerMember(source,64) : Number(integerMember(source,32)); }
    catch (error) { throw new FormatError(`${name}：${error.message}`, name); }
  }
  return tm;
}
const isLeap = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
// Days since the first ISO week of the year began, as glibc counts them.
const isoWeekDays = (yday, wday) => yday - (yday - wday + 382) % 7 + 3;
function isoWeek(tm) {
  let year = tm.tm_year + 1900, days = isoWeekDays(tm.tm_yday,tm.tm_wday);
  if (days < 0) { year--; days = isoWeekDays(tm.tm_yday + 365 + isLeap(year),tm.tm_wday); }
  else {
    const next = isoWeekDays(tm.tm_yday - 365 - isLeap(year),tm.tm_wday);
    if (next >= 0) { year++; days = next; }
  }
  return {year,week:Math.floor(days / 7) + 1};
}
// glibc pads with zeros after the sign, or with spaces before it.
function number(value, digits, pad = '0') {
  const sign = value < 0 ? '-' : '', text = String(Math.abs(value));
  return pad === '0' ? sign + text.padStart(digits - sign.length,'0') : (sign + text).padStart(digits,' ');
}
function convert(letter, tm) {
  const year = tm.tm_year + 1900, hour12 = tm.tm_hour % 12 || 12;
  switch (letter) {
    case 'a': return weekdays[tm.tm_wday].slice(0,3);
    case 'A': return weekdays[tm.tm_wday];
    case 'b': case 'h': return months[tm.tm_mon].slice(0,3);
    case 'B': return months[tm.tm_mon];
    case 'C': return number(Math.floor(year / 100),2);
    case 'd': return number(tm.tm_mday,2);
    case 'e': return number(tm.tm_mday,2,' ');
    case 'g': return number(((isoWeek(tm).year % 100) + 100) % 100,2);
    case 'G': return String(isoWeek(tm).year);
    case 'H': return number(tm.tm_hour,2);
    case 'I': return number(hour12,2);
    case 'j': return number(tm.tm_yday + 1,3);
    case 'm': return number(tm.tm_mon + 1,2);
    case 'M': return number(tm.tm_min,2);
    case 'n': return '\n';
    case 'p': return tm.tm_hour > 11 ? 'PM' : 'AM';
    case 'S': return number(tm.tm_sec,2);
    case 't': return '\t';
    case 'u': return String((tm.tm_wday + 6) % 7 + 1);
    case 'U': return number(Math.floor((tm.tm_yday - tm.tm_wday + 7) / 7),2);
    case 'V': return number(isoWeek(tm).week,2);
    case 'w': return String(tm.tm_wday);
    case 'W': return number(Math.floor((tm.tm_yday - (tm.tm_wday + 6) % 7 + 7) / 7),2);
    case 'y': return number(((tm.tm_year % 100) + 100) % 100,2);
    case 'Y': return String(year);
    case 'z': {
      // glibc reads tm_gmtoff into an int and drops the seconds.
      if (tm.tm_isdst < 0) return '';
      const offset = Number(BigInt.asIntN(32,tm.tm_gmtoff)), minutes = Math.trunc(Math.abs(offset) / 60);
      return (offset < 0 ? '-' : '+') + number(Math.trunc(minutes / 60) * 100 + minutes % 60,4);
    }
    case 'Z':
      // glibc falls back to tzname[] from TZ only when tm_zone is empty.
      if (tm.tm_zone?.length) return Uint8Array.from(tm.tm_zone);
      return tm.tm_isdst < 0 ? '' : tm.tm_isdst <= 1 ? 'UTC' : '?';
    default: return '%';
  }
}
function nextCharacter(format, index) {
  return [...decoder.decode(Uint8Array.from(format.slice(index,index + 4),char => char.charCodeAt(0)))][0] ?? '';
}
export function formatStrftime(source, memberSources) {
  if (source.length > MAX_OUTPUT) throw new FormatError('格式串过长，请控制在 20,000 个字符内。');
  const format = Array.from(formatLiteral(source),byte => String.fromCharCode(byte)).join('');
  const tm = parseMembers(memberSources);
  const chunks = [], parts = [];
  let byteCount = 0;
  function push(value, part) {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    byteCount += bytes.length;
    if (byteCount > MAX_OUTPUT) throw new FormatError('输出超过 20,000 字节，请缩短格式串或 tm_zone。');
    chunks.push(bytes); parts.push(part);
  }
  function expand(text, write, conversion) {
    for (let offset = 0; offset < text.length;) {
      if (text[offset] !== '%') {
        const percent = text.indexOf('%',offset), end = percent < 0 ? text.length : percent;
        write(Uint8Array.from(text.slice(offset,end),char => char.charCodeAt(0)),'literal'); offset = end; continue;
      }
      const modifier = 'EO'.includes(text[offset + 1]) ? text[offset + 1] : '', letter = text[offset + 1 + modifier.length];
      const written = conversion ?? `%${modifier}${letter ?? ''}`;
      if (letter === undefined) throw new FormatError(`格式串末尾的 %${modifier} 缺少转换说明符，未定义行为。`);
      if (!Object.hasOwn(specifiers,letter) || (modifier && !modifiers[modifier].includes(letter))) throw new FormatError(`%${modifier}${nextCharacter(text,offset + 1 + modifier.length)} 不是 C 标准的转换说明，未定义行为。`);
      offset += 2 + modifier.length;
      const {category,reads,expansion} = specifiers[letter];
      for (const name of reads) {
        const range = ranges[name];
        if (range && (tm[name] < range[0] || tm[name] > range[1])) throw new FormatError(`${name} 为 ${tm[name]}，超出正常范围 [${range[0]}, ${range[1]}]，${written} 的结果未指定。`, name);
      }
      // A composite colors each piece by its own conversion; its separators belong to the composite.
      if (expansion) expand(expansion,(bytes,part) => write(bytes,part === 'literal' ? 'composite' : part),written);
      else write(convert(letter,tm),category);
    }
  }
  expand(format,push);
  const bytes = new Uint8Array(byteCount), byteParts = [];
  let cursor = 0;
  chunks.forEach((chunk,index) => { bytes.set(chunk,cursor); cursor += chunk.length; byteParts.push(...Array(chunk.length).fill(parts[index])); });
  return {text:decoder.decode(bytes),spans:outputSpans(bytes,byteParts)};
}
function outputSpans(bytes, byteParts) {
  const spans = [];
  const characterDecoder = new TextDecoder('utf-8', {ignoreBOM:true});
  // Match TextDecoder's initial BOM handling without stripping a later BOM.
  let offset = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (offset < bytes.length) {
    const start = offset, lead = bytes[offset++];
    const length = lead >= 0xc2 && lead <= 0xdf ? 2 : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 1;
    for (let index = 1; index < length && offset < bytes.length; index++) {
      const minimum = index === 1 && lead === 0xe0 ? 0xa0 : index === 1 && lead === 0xf0 ? 0x90 : 0x80;
      const maximum = index === 1 && lead === 0xed ? 0x9f : index === 1 && lead === 0xf4 ? 0x8f : 0xbf;
      if (bytes[offset] < minimum || bytes[offset] > maximum) break;
      offset++;
    }
    const text = characterDecoder.decode(bytes.subarray(start,offset));
    // A character assembled from several origins takes the first converted byte's color.
    const part = byteParts.slice(start,offset).find(item => item !== 'literal') ?? 'literal';
    if (spans.at(-1)?.part === part) spans.at(-1).text += text;
    else spans.push({text,part});
  }
  return spans;
}
export function highlightFormat(source) {
  const parts = [];
  const add = (text, part = 'literal') => { if (text) parts.push({text,part}); };
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf('%',index);
    if (start < 0) { add(source.slice(index)); break; }
    add(source.slice(index,start)); add('%',null);
    const [matched,modifier = '',letter = ''] = /^([EO])?([^]?)/u.exec(source.slice(start + 1));
    add(modifier,'modifier'); add(letter,Object.hasOwn(specifiers,letter) ? specifiers[letter].category : 'literal');
    index = start + 1 + matched.length;
  }
  return parts;
}
