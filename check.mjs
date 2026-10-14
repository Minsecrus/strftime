import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { formatStrftime, highlightFormat, FormatError } from './dist/formatter.js';
const base = {tm_year:'126',tm_mon:'9',tm_mday:'14',tm_hour:'9',tm_min:'30',tm_sec:'0',tm_wday:'3',tm_yday:'286',tm_isdst:'0',tm_gmtoff:'28800',tm_zone:'"CST"'};
const cases = [
  ['%a %Y-%m-%d %H:%M:%S %z',{},'Wed 2026-10-14 09:30:00 +0800'],['%A %B %e',{},'Wednesday October 14'],['%b %h',{},'Oct Oct'],
  ['%c',{},'Wed Oct 14 09:30:00 2026'],['%x|%X|%D|%F|%R|%T|%r',{},'10/14/26|09:30:00|10/14/26|2026-10-14|09:30|09:30:00|09:30:00 AM'],
  ['%C %y %Y %G %g %V %U %W %u %w %j',{},'20 26 2026 2026 26 42 41 41 3 3 287'],['%n%t%%',{},'\n\t%'],
  // C23 7.29.3.5 paragraph 5.
  ['%G %V',{tm_year:'99',tm_mon:'0',tm_mday:'2',tm_wday:'6',tm_yday:'1'},'1998 53'],['%G %V',{tm_year:'97',tm_mon:'11',tm_mday:'30',tm_wday:'2',tm_yday:'363'},'1998 01'],
  ['%C|%y|%Y',{tm_year:'-901'},'09|99|999'],['%C|%y|%Y',{tm_year:'-1905'},'-1|95|-5'],['%C|%Y',{tm_year:'10100'},'120|12000'],
  ['%I %p',{tm_hour:'0'},'12 AM'],['%I %p',{tm_hour:'12'},'12 PM'],['%I %p',{tm_hour:'13'},'01 PM'],['[%e][%d][%j]',{tm_mday:'4',tm_yday:'0'},'[ 4][04][001]'],['%S',{tm_sec:'60'},'60'],
  ['%z',{tm_gmtoff:'-16200'},'-0430'],['%z',{tm_gmtoff:'3661'},'+0101'],['[%z][%Z]',{tm_isdst:'-1'},'[][CST]'],['[%z][%Z]',{tm_isdst:'-1',tm_zone:''},'[][]'],
  ['%Z',{tm_zone:''},'UTC'],['%Z',{tm_zone:'NULL',tm_isdst:'2'},'?'],['%Z',{tm_zone:'"C" "ST"'},'CST'],['%Z',{tm_zone:'"\\xE5\\x8C\\x97\\xE4\\xBA\\xAC"'},'北京'],
  ['%Ec|%EC|%Ex|%EX|%Ey|%EY',{},'Wed Oct 14 09:30:00 2026|20|10/14/26|09:30:00|26|2026'],['%Ob|%OB|%Od|%Oe|%OH|%OI|%Om|%OM|%OS|%Ou|%OU|%OV|%Ow|%OW|%Oy',{},'Oct|October|14|14|09|09|10|30|00|3|41|42|3|41|26'],
  ['%Y',{tm_year:'0x7E'},'2026'],['%Y',{tm_year:"1'26"},'2026'],['%Y',{tm_year:''},'1900'],['%Y',{tm_year:'3000000000'},'-1294965396'],['%Y',{tm_mday:'0'},'2026'],
  ['"%Y" "!"',{},'2026!'],['\\x25Y',{},'2026'],['%Y\\0%m',{},'2026'],['年份：%Y',{},'年份：2026']
];
for (const [format,overrides,expected] of cases) {
  const result = formatStrftime(format,{...base,...overrides});
  assert.equal(result.text,expected,`${format} / ${JSON.stringify(overrides)}`);
  assert.equal(result.spans.map(span => span.text).join(''),result.text,'Coloring must preserve the decoded output.');
}
for (const [format,overrides,field] of [
  ['%d',{tm_mday:'0'},'tm_mday'],['%c',{tm_yday:'400'},'tm_yday'],['%x',{tm_hour:'24'},'tm_hour'],['%a',{tm_wday:'7'},'tm_wday'],['%B',{tm_mon:'12'},'tm_mon'],['%S',{tm_sec:'61'},'tm_sec'],
  ['%Ed',{},'format'],['%Oh',{},'format'],['%EF',{},'format'],['%k',{},'format'],['%-d',{},'format'],['%',{},'format'],['%E',{},'format'],['say "hi"',{},'format'],['"%Y',{},'format'],['%Y\\q',{},'format'],
  ['%Y',{tm_year:'18446744073709551616'},'tm_year'],['%Y',{tm_year:'1lL'},'tm_year'],['%Y',{tm_year:'08'},'tm_year'],['%Y',{tm_year:'-'},'tm_year'],['%Z',{tm_zone:'u8"x"'},'tm_zone'],['%Z',{tm_zone:'"CST'},'tm_zone']
]) assert.throws(() => formatStrftime(format,{...base,...overrides}),error => error instanceof FormatError && error.field === field,`${format} / ${JSON.stringify(overrides)}`);
// Every day from 1900 to 2100 against an independent ISO 8601 and first-weekday week count.
const day = 864e5;
for (let time = Date.UTC(1900,0,1); time <= Date.UTC(2100,11,31); time += day) {
  const date = new Date(time), year = date.getUTCFullYear(), yday = (time - Date.UTC(year,0,1)) / day, wday = date.getUTCDay();
  const thursday = time + (3 - (wday + 6) % 7) * day, isoYear = new Date(thursday).getUTCFullYear(), isoWeek = Math.floor((thursday - Date.UTC(isoYear,0,1)) / day / 7) + 1;
  const firstWeek = start => { const first = (start - new Date(Date.UTC(year,0,1)).getUTCDay() + 7) % 7; return yday < first ? 0 : Math.floor((yday - first) / 7) + 1; };
  const tm = {...base,tm_year:String(year - 1900),tm_mon:String(date.getUTCMonth()),tm_mday:String(date.getUTCDate()),tm_wday:String(wday),tm_yday:String(yday)};
  const pad = value => String(value).padStart(2,'0');
  assert.equal(formatStrftime('%G %V %U %W %F',tm).text,`${isoYear} ${pad(isoWeek)} ${pad(firstWeek(0))} ${pad(firstWeek(1))} ${date.toISOString().slice(0,10)}`);
}
assert.deepEqual(formatStrftime('%F',base).spans,[{text:'2026',part:'year'},{text:'-',part:'composite'},{text:'10',part:'month'},{text:'-',part:'composite'},{text:'14',part:'day'}]);
assert.deepEqual(formatStrftime('at %R',base).spans,[{text:'at ',part:'literal'},{text:'09',part:'time'},{text:':',part:'composite'},{text:'30',part:'time'}]);
assert.deepEqual(highlightFormat('%EY-%m'),[{text:'%',part:null},{text:'E',part:'modifier'},{text:'Y',part:'year'},{text:'-',part:'literal'},{text:'%',part:null},{text:'m',part:'month'}]);
for (const value of ['%Y-%m-%d %H:%M:%S','%','%E','%%z','%k %Oq','"中文 %c"']) assert.equal(highlightFormat(value).map(part => part.text).join(''),value);
const html = readFileSync('dist/index.html','utf8');
for (const ref of html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)) assert(existsSync(`dist/${ref[1]}`),`missing asset ${ref[1]}`);
console.log(`${cases.length} formatting cases, error paths, 73414 calendar days and local asset references passed.`);
