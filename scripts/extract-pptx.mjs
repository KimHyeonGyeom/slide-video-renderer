#!/usr/bin/env node
// .pptx 에서 슬라이드 객체의 좌표(EMU)를 뽑는다. 그룹은 자식까지 절대 좌표로 풀고, 위치가 없는 플레이스홀더는 레이아웃·마스터에서 상속받는다.
// 사용: node scripts/extract-pptx.mjs deck.pptx [슬라이드번호 ...]   (기본 전체)
// 출력: 콘솔 표 + <deck>.objects.json  ({ slides: [{ index, objects: [{ id, name, kind, group, left, top, width, height, rot, text }] }] })
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const [pptxPath, ...slideArgs] = process.argv.slice(2);
if (!pptxPath) {
  console.error('usage: node scripts/extract-pptx.mjs deck.pptx [slide numbers]');
  process.exit(1);
}

const zip = new AdmZip(pptxPath);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true, parseTagValue: false });
const read = (name) => (zip.getEntry(name) ? parser.parse(zip.readAsText(name)) : null);

// ── preserveOrder 트리 헬퍼: 노드 = { tag: [children], ':@': attrs } ──
const tagOf = (node) => Object.keys(node).find((k) => k !== ':@');
const attrsOf = (node) => node[':@'] ?? {};
const childrenOf = (node) => node[tagOf(node)] ?? [];
const child = (node, tag) => childrenOf(node).find((n) => tagOf(n) === tag);
const descend = (node, ...tags) => tags.reduce((n, t) => (n ? child(n, t) : undefined), node);
function findDeep(nodes, tag) {
  for (const n of nodes) {
    if (tagOf(n) === tag) return n;
    const found = findDeep(childrenOf(n), tag);
    if (found) return found;
  }
  return undefined;
}
function textOf(node) {
  const out = [];
  (function walk(nodes) {
    for (const n of nodes) {
      const t = tagOf(n);
      if (t === 'a:t') out.push(childrenOf(n).map((c) => c['#text'] ?? '').join(''));
      else if (t === 'a:p') { walk(childrenOf(n)); out.push(' '); }
      else walk(childrenOf(n));
    }
  })(childrenOf(node));
  return out.join('').replace(/\s+/g, ' ').trim();
}

// ── xfrm 읽기 ──
function readXfrm(xfrm) {
  if (!xfrm) return null;
  const off = child(xfrm, 'a:off'), ext = child(xfrm, 'a:ext'), chOff = child(xfrm, 'a:chOff'), chExt = child(xfrm, 'a:chExt');
  if (!off || !ext) return null;
  const n = (node, k) => Number(attrsOf(node)[k]);
  return {
    x: n(off, 'x'), y: n(off, 'y'), cx: n(ext, 'cx'), cy: n(ext, 'cy'),
    rot: Number(attrsOf(xfrm).rot ?? 0) / 60000,
    chOff: chOff ? { x: n(chOff, 'x'), y: n(chOff, 'y') } : null,
    chExt: chExt ? { cx: n(chExt, 'cx'), cy: n(chExt, 'cy') } : null,
  };
}
const NV = { 'p:sp': 'p:nvSpPr', 'p:pic': 'p:nvPicPr', 'p:cxnSp': 'p:nvCxnSpPr', 'p:graphicFrame': 'p:nvGraphicFramePr', 'p:grpSp': 'p:nvGrpSpPr' };
const KIND = { 'p:sp': 'shape', 'p:pic': 'picture', 'p:cxnSp': 'connector', 'p:graphicFrame': 'frame', 'p:grpSp': 'group' };
function shapeXfrm(node) {
  const tag = tagOf(node);
  if (tag === 'p:graphicFrame') return readXfrm(child(node, 'p:xfrm'));
  if (tag === 'p:grpSp') return readXfrm(descend(node, 'p:grpSpPr', 'a:xfrm'));
  return readXfrm(descend(node, 'p:spPr', 'a:xfrm'));
}
function placeholderOf(node) {
  const ph = descend(node, NV[tagOf(node)], 'p:nvPr', 'p:ph');
  return ph ? { type: attrsOf(ph).type ?? 'body', idx: attrsOf(ph).idx } : null;
}
function frameKind(node) {
  const g = descend(node, 'a:graphic', 'a:graphicData');
  const uri = g ? attrsOf(g).uri ?? '' : '';
  if (uri.includes('/table')) return 'table';
  if (uri.includes('/chart')) return 'chart';
  if (uri.includes('/diagram')) return 'smartart';
  if (uri.includes('/ole')) return 'ole';
  return 'frame';
}

// ── 플레이스홀더 상속: 슬라이드 → 레이아웃 → 마스터 ──
function relTarget(relsName, typeSuffix) {
  const rels = read(relsName);
  if (!rels) return null;
  const list = findDeep(rels, 'Relationships');
  const rel = childrenOf(list).find((r) => (attrsOf(r).Type ?? '').endsWith(typeSuffix));
  return rel ? path.posix.normalize(path.posix.join(path.posix.dirname(relsName.replace('/_rels', '').replace('.rels', '')), attrsOf(rel).Target)) : null;
}
function placeholdersOf(partName) {
  const doc = read(partName);
  const tree = doc && findDeep(doc, 'p:spTree');
  const map = [];
  if (!tree) return map;
  for (const n of childrenOf(tree)) {
    const ph = placeholderOf(n);
    if (ph) map.push({ ...ph, xfrm: shapeXfrm(n) });
  }
  return map;
}
const TYPE_ALIAS = { ctrTitle: 'title', subTitle: 'body', obj: 'body' };
function inheritXfrm(ph, chain) {
  for (const list of chain) {
    const byIdx = ph.idx != null && list.find((p) => p.idx === ph.idx && p.xfrm);
    const byType = list.find((p) => (TYPE_ALIAS[p.type] ?? p.type) === (TYPE_ALIAS[ph.type] ?? ph.type) && p.xfrm);
    const hit = byIdx || byType;
    if (hit) return hit.xfrm;
  }
  return null;
}

// ── 슬라이드 순회 ──
function extractSlide(index) {
  const slideName = `ppt/slides/slide${index}.xml`;
  const doc = read(slideName);
  if (!doc) return null;
  const layoutName = relTarget(`ppt/slides/_rels/slide${index}.xml.rels`, '/slideLayout');
  const masterName = layoutName && relTarget(`${path.posix.dirname(layoutName)}/_rels/${path.posix.basename(layoutName)}.rels`, '/slideMaster');
  const chain = [layoutName, masterName].filter(Boolean).map(placeholdersOf);

  const objects = [];
  const identity = (r) => r;
  (function walk(nodes, toAbs, groupPath) {
    for (const node of nodes) {
      const tag = tagOf(node);
      if (!KIND[tag]) continue;
      const cnv = descend(node, NV[tag], 'p:cNvPr');
      const name = cnv ? attrsOf(cnv).name : '';
      const id = cnv ? attrsOf(cnv).id : '';
      const ph = placeholderOf(node);
      let xfrm = shapeXfrm(node);
      let inherited = false;
      if (!xfrm && ph) { xfrm = inheritXfrm(ph, chain); inherited = !!xfrm; }
      const rect = xfrm ? toAbs({ x: xfrm.x, y: xfrm.y, cx: xfrm.cx, cy: xfrm.cy }) : null;
      const entry = {
        id, name,
        kind: tag === 'p:graphicFrame' ? frameKind(node) : KIND[tag],
        group: groupPath.join(' > ') || null,
        ...(rect ? { left: Math.round(rect.x), top: Math.round(rect.y), width: Math.round(rect.cx), height: Math.round(rect.cy) } : { left: null, top: null, width: null, height: null }),
        rot: xfrm?.rot || 0,
        placeholder: ph ? `${ph.type}${ph.idx != null ? `#${ph.idx}` : ''}${inherited ? ' (inherited)' : ''}` : null,
        text: tag === 'p:grpSp' ? '' : textOf(node).slice(0, 60),
      };
      objects.push(entry);
      if (tag === 'p:grpSp' && xfrm) {
        // 자식 좌표(chOff/chExt 공간) → 그룹 좌표(off/ext) → 바깥 좌표
        const sx = xfrm.chExt?.cx ? xfrm.cx / xfrm.chExt.cx : 1;
        const sy = xfrm.chExt?.cy ? xfrm.cy / xfrm.chExt.cy : 1;
        const ox = xfrm.chOff?.x ?? 0, oy = xfrm.chOff?.y ?? 0;
        const toGroup = (r) => ({ x: xfrm.x + (r.x - ox) * sx, y: xfrm.y + (r.y - oy) * sy, cx: r.cx * sx, cy: r.cy * sy });
        walk(childrenOf(node), (r) => toAbs(toGroup(r)), [...groupPath, name || `group#${id}`]);
      }
    }
  })(childrenOf(findDeep(doc, 'p:spTree')), identity, []);
  return { index, objects };
}

const sldSz = findDeep(read('ppt/presentation.xml'), 'p:sldSz');
const slideSize = { cx: Number(attrsOf(sldSz).cx), cy: Number(attrsOf(sldSz).cy) };
const total = zip.getEntries().filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName)).length;
const indexes = slideArgs.length ? slideArgs.map(Number) : Array.from({ length: total }, (_, i) => i + 1);
const slides = indexes.map(extractSlide).filter(Boolean);

// ── 출력 ──
const emuPerPx = slideSize.cx / 1920;
const px = (v) => (v == null ? '-' : Math.round(v / emuPerPx));
console.log(`slide size: ${slideSize.cx} x ${slideSize.cy} EMU (${(slideSize.cx / 914400).toFixed(2)} x ${(slideSize.cy / 914400).toFixed(2)} in, 1920px 기준 1px = ${emuPerPx.toFixed(1)} EMU)`);
for (const s of slides) {
  console.log(`\n== slide ${s.index}: ${s.objects.length} objects`);
  console.log('  id  kind        left       top        width      height    (px: l,t,w,h)          group / placeholder / text');
  for (const o of s.objects) {
    const indent = '  '.repeat(o.group ? o.group.split(' > ').length : 0);
    const dims = [o.left, o.top, o.width, o.height].map((v) => String(v ?? '-').padStart(9)).join('  ');
    const pxs = `(${px(o.left)},${px(o.top)} ${px(o.width)}x${px(o.height)})`.padEnd(24);
    const info = [o.placeholder && `[${o.placeholder}]`, o.rot ? `rot ${o.rot}°` : null, o.text && `"${o.text}"`].filter(Boolean).join(' ');
    console.log(`  ${String(o.id).padStart(3)} ${indent}${o.kind.padEnd(10 - Math.min(indent.length, 6))} ${dims}  ${pxs} ${o.name}${info ? '  ' + info : ''}`);
  }
}
const outPath = pptxPath.replace(/\.pptx$/i, '') + '.objects.json';
writeFileSync(outPath, JSON.stringify({ slideSize, slides }, null, 2));
console.log(`\nwritten: ${outPath}`);
