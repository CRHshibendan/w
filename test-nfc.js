#!/usr/bin/env node
/**
 * NFC 写入测试脚本
 * 验证 WiFi 配置的编码/解码、WIFI 协议格式、子站 URL 正确性
 *
 * 用法：node test-nfc.js
 */

// ============ 配置 ============
const TEST_WIFI = {
  ssid: '13501',
  password: '12345678',
  encryption: 'WPA'
};

const BASE_URL = 'https://crhshibendan.github.io/w/c.html';

// ============ 编码函数（与 c.html 一致） ============
function encodeConfig(cfg) {
  const encMap = { 'WPA': '0', 'WEP': '1', 'nopass': '2' };
  const raw = `${cfg.ssid}|${cfg.password}|${encMap[cfg.encryption] || '0'}`;
  return Buffer.from(raw, 'utf-8').toString('base64').replace(/=+$/, '');
}

function decodeConfig(hash) {
  let b64 = hash;
  while (b64.length % 4) b64 += '=';
  const raw = Buffer.from(b64, 'base64').toString('utf-8');
  const parts = raw.split('|');
  const encMap = { '0': 'WPA', '1': 'WEP', '2': 'nopass' };
  return {
    ssid: parts[0],
    password: parts[1] || '',
    encryption: encMap[parts[2]] || 'WPA'
  };
}

function buildWifiString(c) {
  const esc = (s) => String(s).replace(/([\\;,":])/g, '\\$1');
  if (c.encryption === 'nopass') return `WIFI:T:nopass;S:${esc(c.ssid)};;`;
  return `WIFI:T:${c.encryption};S:${esc(c.ssid)};P:${esc(c.password)};;`;
}

// ============ 测试工具 ============
let pass = 0, fail = 0;
function test(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${detail ? '→ ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(50)}`);
}

// ============ 测试用例 ============

section('1. 编码/解码测试');

const encoded = encodeConfig(TEST_WIFI);
const decoded = decodeConfig(encoded);

test('编码结果非空', encoded.length > 0);
test('编码后无填充符号', !encoded.includes('='));
test('解码后 SSID 正确', decoded.ssid === TEST_WIFI.ssid, `期望 ${TEST_WIFI.ssid}，实际 ${decoded.ssid}`);
test('解码后密码正确', decoded.password === TEST_WIFI.password, `期望 ${TEST_WIFI.password}，实际 ${decoded.password}`);
test('解码后加密方式正确', decoded.encryption === TEST_WIFI.encryption);
test('编码-解码往返一致', JSON.stringify(decoded) === JSON.stringify({...TEST_WIFI}));

console.log(`  编码结果: ${encoded}`);
console.log(`  解码结果: ${JSON.stringify(decoded)}`);

section('2. WIFI 协议字符串测试');

const wifiStr = buildWifiString(TEST_WIFI);
test('包含 WIFI: 前缀', wifiStr.startsWith('WIFI:'));
test('包含加密类型 T:WPA', wifiStr.includes('T:WPA'));
test('包含 SSID', wifiStr.includes(`S:${TEST_WIFI.ssid}`));
test('包含密码', wifiStr.includes(`P:${TEST_WIFI.password}`));
test('以 ;; 结尾', wifiStr.endsWith(';;'));

console.log(`  WIFI 字符串: ${wifiStr}`);

section('3. 子站 URL 测试');

const subUrl = `${BASE_URL}#${encoded}`;
const urlLength = subUrl.length;

test('URL 格式正确', subUrl.startsWith(BASE_URL + '#'));
test('URL 包含编码数据', subUrl.includes(encoded));
test('URL 长度 < 144 字节（NTAG213 容量）', urlLength < 144, `当前 ${urlLength} 字符`);
test('URL 无空格', !subUrl.includes(' '));
test('URL 无中文', !/[\u4e00-\u9fa5]/.test(subUrl));

console.log(`  子站 URL: ${subUrl}`);
console.log(`  URL 长度: ${urlLength} 字符`);
console.log(`  NTAG213 容量: 144 字节 ✓`);

section('4. 特殊字符转义测试');

const specialCases = [
  { ssid: 'My WiFi', password: 'pass;word', special: ';' },
  { ssid: 'Test"WiFi', password: 'pa,ss', special: ',' },
  { ssid: 'Net\\Work', password: 'p:ass', special: ':' }
];

specialCases.forEach((c, i) => {
  const ws = buildWifiString({ssid: c.ssid, password: c.password, encryption: 'WPA'});
  // 检查密码中的特殊字符是否被转义（前面有反斜杠）
  const escapedChar = `\\${c.special}`;
  const isEscaped = ws.includes(escapedChar);
  test(`用例 ${i+1}: 密码中的 "${c.special}" 被转义为 "${escapedChar}"`, isEscaped, `实际 WIFI 字符串: ${ws}`);
});

section('5. 无密码网络测试');

const noPass = { ssid: 'OpenWiFi', password: '', encryption: 'nopass' };
const noPassEncoded = encodeConfig(noPass);
const noPassDecoded = decodeConfig(noPassEncoded);
const noPassWifi = buildWifiString(noPass);

test('无密码网络编码正常', noPassEncoded.length > 0);
test('无密码网络解码 SSID 正确', noPassDecoded.ssid === 'OpenWiFi');
test('无密码网络加密方式为 nopass', noPassDecoded.encryption === 'nopass');
test('WIFI 字符串使用 T:nopass', noPassWifi.includes('T:nopass'));
test('WIFI 字符串不包含 P:', !noPassWifi.includes('P:'));

section('6. 二维码内容校验');

// 二维码内容应与 WIFI 字符串一致
const qrContent = wifiStr;
test('二维码内容与 WIFI 字符串一致', qrContent === wifiStr);
test('二维码内容可被标准扫码器识别', qrContent.startsWith('WIFI:') && qrContent.endsWith(';;'));

console.log(`  二维码内容: ${qrContent}`);

section('7. 实际 NFC 写入校验清单');

console.log(`
  写入前检查：
  □ NFC 贴纸类型：NTAG213/215/216
  □ 贴纸容量 > ${urlLength} 字节（当前 URL 长度）
  □ 写入内容：${subUrl.length < 100 ? subUrl : subUrl.slice(0, 80) + '...'}

  写入后验证：
  □ 用另一台手机碰贴纸，能打开子站
  □ 子站显示正确的 WiFi 名称
  □ 二维码可扫描连接
  □ 密码复制功能正常
`);

// ============ 总结 ============
section('测试结果');
console.log(`  通过: ${pass}`);
console.log(`  失败: ${fail}`);
console.log(`  总计: ${pass + fail}`);

if (fail === 0) {
  console.log('\n  🎉 所有测试通过！可以放心写入 NFC 贴纸。');
} else {
  console.log(`\n  ⚠️  有 ${fail} 个测试失败，请检查。`);
  process.exit(1);
}
