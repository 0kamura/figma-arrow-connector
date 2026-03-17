// Arrow Connector Plugin - FigJam風の矢印でFrameを繋ぐ

const isRelaunch = figma.command === "refresh-all";

figma.showUI(__html__, { width: 320, height: 520 });

const PLUGIN_DATA_KEY = "arrow-connector-data";

interface Point {
  x: number;
  y: number;
}

interface EdgeInfo {
  point: Point;
  side: "top" | "bottom" | "left" | "right";
}

type Side = "auto" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface ArrowOptions {
  color: string; // hex
  strokeWeight: number;
  curved: boolean;
  arrowSize: number;
  dashed: boolean;
  startSide: Side;
  endSide: Side;
  label: string;
  startArrow: boolean;
  endArrow: boolean;
  bendPosition: number;
}

interface ArrowData {
  sourceId: string;
  targetId: string;
  options: ArrowOptions;
}

// ノードの絶対座標バウンディングボックスを取得
function getAbsBounds(node: SceneNode): { x: number; y: number; width: number; height: number } {
  const bb = node.absoluteBoundingBox;
  if (bb) return bb;
  // fallback (absoluteBoundingBox が null の場合)
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

// フレームの8接続点を取得（辺の中点4 + 角4）
function getAllConnectionPoints(node: SceneNode): EdgeInfo[] {
  const { x, y, width, height } = getAbsBounds(node);
  return [
    { point: { x: x + width / 2, y: y }, side: "top" },
    { point: { x: x + width / 2, y: y + height }, side: "bottom" },
    { point: { x: x, y: y + height / 2 }, side: "left" },
    { point: { x: x + width, y: y + height / 2 }, side: "right" },
    { point: { x: x, y: y }, side: "top" },             // top-left
    { point: { x: x + width, y: y }, side: "top" },      // top-right
    { point: { x: x, y: y + height }, side: "bottom" },  // bottom-left
    { point: { x: x + width, y: y + height }, side: "bottom" }, // bottom-right
  ];
}

// 2点間の距離
function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// 指定された位置の接続点を取得
function getConnectionPoint(node: SceneNode, side: Exclude<Side, "auto">): EdgeInfo {
  const { x, y, width, height } = getAbsBounds(node);
  switch (side) {
    case "top":
      return { point: { x: x + width / 2, y: y }, side: "top" };
    case "bottom":
      return { point: { x: x + width / 2, y: y + height }, side: "bottom" };
    case "left":
      return { point: { x: x, y: y + height / 2 }, side: "left" };
    case "right":
      return { point: { x: x + width, y: y + height / 2 }, side: "right" };
    case "top-left":
      return { point: { x: x, y: y }, side: "top" };
    case "top-right":
      return { point: { x: x + width, y: y }, side: "top" };
    case "bottom-left":
      return { point: { x: x, y: y + height }, side: "bottom" };
    case "bottom-right":
      return { point: { x: x + width, y: y + height }, side: "bottom" };
  }
}

// 接続点を決定（手動指定 or 自動で最も近い点）
function findConnectionPoints(
  nodeA: SceneNode,
  nodeB: SceneNode,
  startSide: Side,
  endSide: Side
): { start: EdgeInfo; end: EdgeInfo } {
  // 両方手動指定
  if (startSide !== "auto" && endSide !== "auto") {
    return {
      start: getConnectionPoint(nodeA, startSide),
      end: getConnectionPoint(nodeB, endSide),
    };
  }

  // 片方だけ手動指定
  if (startSide !== "auto") {
    const fixedStart = getConnectionPoint(nodeA, startSide);
    const edgesB = getAllConnectionPoints(nodeB);
    let bestEnd = edgesB[0];
    let minDist = Infinity;
    for (const b of edgesB) {
      const d = distance(fixedStart.point, b.point);
      if (d < minDist) { minDist = d; bestEnd = b; }
    }
    return { start: fixedStart, end: bestEnd };
  }

  if (endSide !== "auto") {
    const fixedEnd = getConnectionPoint(nodeB, endSide);
    const edgesA = getAllConnectionPoints(nodeA);
    let bestStart = edgesA[0];
    let minDist = Infinity;
    for (const a of edgesA) {
      const d = distance(a.point, fixedEnd.point);
      if (d < minDist) { minDist = d; bestStart = a; }
    }
    return { start: bestStart, end: fixedEnd };
  }

  // 両方自動
  const edgesA = getAllConnectionPoints(nodeA);
  const edgesB = getAllConnectionPoints(nodeB);
  let minDist = Infinity;
  let bestStart = edgesA[0];
  let bestEnd = edgesB[0];
  for (const a of edgesA) {
    for (const b of edgesB) {
      const d = distance(a.point, b.point);
      if (d < minDist) { minDist = d; bestStart = a; bestEnd = b; }
    }
  }
  return { start: bestStart, end: bestEnd };
}

// 直角折れ線の中間点を計算（bendPosition: 0~1 で折れ位置を制御）
function calcElbowPoints(start: EdgeInfo, end: EdgeInfo, bendPosition: number = 0.5): Point[] {
  const s = start.point;
  const e = end.point;
  const t = Math.max(0.05, Math.min(0.95, bendPosition));

  const isHorizontalStart = start.side === "left" || start.side === "right";
  const isHorizontalEnd = end.side === "left" || end.side === "right";

  // 同方向（水平→水平 or 垂直→垂直）
  if (isHorizontalStart && isHorizontalEnd) {
    const midX = s.x + (e.x - s.x) * t;
    return [
      { x: midX, y: s.y },
      { x: midX, y: e.y },
    ];
  }

  if (!isHorizontalStart && !isHorizontalEnd) {
    const midY = s.y + (e.y - s.y) * t;
    return [
      { x: s.x, y: midY },
      { x: e.x, y: midY },
    ];
  }

  // 異方向（水平→垂直 or 垂直→水平）: 1回折りでOK
  if (isHorizontalStart && !isHorizontalEnd) {
    const bendX = s.x + (e.x - s.x) * t;
    return [
      { x: bendX, y: s.y },
      { x: bendX, y: e.y },
    ];
  }

  // 垂直→水平
  const bendY = s.y + (e.y - s.y) * t;
  return [
    { x: s.x, y: bendY },
    { x: e.x, y: bendY },
  ];
}

// ベジェ曲線の制御点を計算（FigJam風のカーブ）
function calcControlPoints(
  start: EdgeInfo,
  end: EdgeInfo
): { cp1: Point; cp2: Point } {
  const dist = distance(start.point, end.point);
  const offset = Math.min(dist * 0.25, 80);

  function applyOffset(edge: EdgeInfo, dir: number): Point {
    switch (edge.side) {
      case "top":
        return { x: edge.point.x, y: edge.point.y - offset * dir };
      case "bottom":
        return { x: edge.point.x, y: edge.point.y + offset * dir };
      case "left":
        return { x: edge.point.x - offset * dir, y: edge.point.y };
      case "right":
        return { x: edge.point.x + offset * dir, y: edge.point.y };
    }
  }

  return {
    cp1: applyOffset(start, 1),
    cp2: applyOffset(end, 1),
  };
}

// ベジェ曲線上の点と接線を計算（t: 0~1）
function bezierPointAndTangent(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): { point: Point; angle: number } {
  const mt = 1 - t;
  const point: Point = {
    x:
      mt * mt * mt * p0.x +
      3 * mt * mt * t * p1.x +
      3 * mt * t * t * p2.x +
      t * t * t * p3.x,
    y:
      mt * mt * mt * p0.y +
      3 * mt * mt * t * p1.y +
      3 * mt * t * t * p2.y +
      t * t * t * p3.y,
  };

  const tx =
    3 * mt * mt * (p1.x - p0.x) +
    6 * mt * t * (p2.x - p1.x) +
    3 * t * t * (p3.x - p2.x);
  const ty =
    3 * mt * mt * (p1.y - p0.y) +
    6 * mt * t * (p2.y - p1.y) +
    3 * t * t * (p3.y - p2.y);

  return { point, angle: Math.atan2(ty, tx) };
}

// 矢じりの深さ（先端から根元までの長さ）
function arrowDepth(size: number): number {
  return size * Math.cos(Math.PI / 6); // size * √3/2
}

// 点を角度方向にオフセット
function offsetPoint(pt: Point, angle: number, dist: number): Point {
  return { x: pt.x + Math.cos(angle) * dist, y: pt.y + Math.sin(angle) * dist };
}

// 矢じり（三角形）を作成
function createArrowhead(
  tip: Point,
  angle: number,
  size: number,
  color: RGB
): VectorNode {
  const arrow = figma.createVector();

  const backAngle = Math.PI / 6;
  const p1 = tip;
  const p2 = {
    x: tip.x - size * Math.cos(angle - backAngle),
    y: tip.y - size * Math.sin(angle - backAngle),
  };
  const p3 = {
    x: tip.x - size * Math.cos(angle + backAngle),
    y: tip.y - size * Math.sin(angle + backAngle),
  };

  const minX = Math.min(p1.x, p2.x, p3.x) - 5;
  const minY = Math.min(p1.y, p2.y, p3.y) - 5;
  const maxX = Math.max(p1.x, p2.x, p3.x) + 5;
  const maxY = Math.max(p1.y, p2.y, p3.y) + 5;

  arrow.x = minX;
  arrow.y = minY;
  arrow.resize(Math.max(maxX - minX, 1), Math.max(maxY - minY, 1));

  const rp1 = { x: p1.x - minX, y: p1.y - minY };
  const rp2 = { x: p2.x - minX, y: p2.y - minY };
  const rp3 = { x: p3.x - minX, y: p3.y - minY };

  arrow.vectorPaths = [
    {
      windingRule: "NONZERO",
      data: `M ${rp1.x} ${rp1.y} L ${rp2.x} ${rp2.y} L ${rp3.x} ${rp3.y} Z`,
    },
  ];
  arrow.fills = [{ type: "SOLID", color }];
  arrow.strokes = [];

  return arrow;
}

// HEX → RGB変換
function hexToRgb(hex: string): RGB {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

// RGB → HEX変換
function rgbToHex(color: RGB): string {
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

// 折れ線パスの中間点を求める
function getPathMidpoint(points: Point[]): Point {
  // 全セグメントの長さを計算
  let totalLength = 0;
  const segLengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const len = distance(points[i - 1], points[i]);
    segLengths.push(len);
    totalLength += len;
  }
  // 中間地点を探す
  let remaining = totalLength / 2;
  for (let i = 0; i < segLengths.length; i++) {
    if (remaining <= segLengths[i]) {
      const t = remaining / segLengths[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    remaining -= segLengths[i];
  }
  // fallback
  return points[Math.floor(points.length / 2)];
}

// ベジェ曲線をt値で分割（De Casteljau）
function splitBezier(
  p0: Point, p1: Point, p2: Point, p3: Point, t: number
): { first: [Point, Point, Point, Point]; second: [Point, Point, Point, Point] } {
  const lerp = (a: Point, b: Point, t: number): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const f = lerp(d, e, t);
  return {
    first: [p0, a, d, f],
    second: [f, e, c, p3],
  };
}

// ベジェ曲線上のtを、中間点からの距離で求める（二分探索）
function findBezierT(
  p0: Point, p1: Point, p2: Point, p3: Point, midT: number, halfGap: number, direction: -1 | 1
): number {
  let lo = direction === -1 ? 0 : midT;
  let hi = direction === -1 ? midT : 1;
  const midPt = bezierPointAndTangent(p0, p1, p2, p3, midT).point;

  for (let i = 0; i < 20; i++) {
    const t = (lo + hi) / 2;
    const pt = bezierPointAndTangent(p0, p1, p2, p3, t).point;
    const d = distance(midPt, pt);
    if (d < halfGap) {
      if (direction === -1) hi = t; else lo = t;
    } else {
      if (direction === -1) lo = t; else hi = t;
    }
  }
  return (lo + hi) / 2;
}

// 折れ線のパスにギャップを作る
function splitPolylineAtGap(
  points: Point[], gapCenter: Point, halfGap: number
): { before: Point[]; after: Point[] } {
  // パス上の累積距離を計算
  const dists: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    dists.push(dists[i - 1] + distance(points[i - 1], points[i]));
  }
  const totalLen = dists[dists.length - 1];

  // ギャップ中心のパス上の位置を求める
  let centerDist = totalLen / 2; // fallback
  // gapCenterに最も近いパス上の点を見つける
  let minD = Infinity;
  for (let i = 1; i < points.length; i++) {
    const segLen = distance(points[i - 1], points[i]);
    if (segLen === 0) continue;
    // 線分上の最近点
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    let t = ((gapCenter.x - points[i - 1].x) * dx + (gapCenter.y - points[i - 1].y) * dy) / (segLen * segLen);
    t = Math.max(0, Math.min(1, t));
    const proj = { x: points[i - 1].x + dx * t, y: points[i - 1].y + dy * t };
    const d = distance(gapCenter, proj);
    if (d < minD) {
      minD = d;
      centerDist = dists[i - 1] + segLen * t;
    }
  }

  const gapStart = Math.max(0, centerDist - halfGap);
  const gapEnd = Math.min(totalLen, centerDist + halfGap);

  function pointAtDist(targetDist: number): Point {
    for (let i = 1; i < points.length; i++) {
      if (dists[i] >= targetDist) {
        const segLen = dists[i] - dists[i - 1];
        const t = segLen > 0 ? (targetDist - dists[i - 1]) / segLen : 0;
        return {
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
        };
      }
    }
    return points[points.length - 1];
  }

  // before: start → gapStart
  const before: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (dists[i] <= gapStart) {
      before.push(points[i]);
    } else {
      before.push(pointAtDist(gapStart));
      break;
    }
  }

  // after: gapEnd → end
  const afterStart = pointAtDist(gapEnd);
  const after: Point[] = [afterStart];
  for (let i = 1; i < points.length; i++) {
    if (dists[i] > gapEnd) {
      after.push(points[i]);
    }
  }

  return { before, after };
}

// ラベルテキストを作成
async function createLabel(pos: Point, text: string, color: RGB, strokeWeight: number): Promise<SceneNode> {
  const label = figma.createText();
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  label.fontName = { family: "Inter", style: "Medium" };
  label.fontSize = Math.max(12, strokeWeight * 4);
  label.characters = text;
  label.fills = [{ type: "SOLID", color }];
  label.textAlignHorizontal = "CENTER";
  label.textAlignVertical = "CENTER";

  label.x = pos.x - label.width / 2;
  label.y = pos.y - label.height / 2;

  return label;
}

// 矢印を描画（新規作成 or 既存グループを再描画）
async function drawArrow(
  nodeA: SceneNode,
  nodeB: SceneNode,
  options: ArrowOptions,
  existingGroup?: GroupNode
): Promise<GroupNode> {
  const { start, end } = findConnectionPoints(nodeA, nodeB, options.startSide || "auto", options.endSide || "auto");
  const color = hexToRgb(options.color);

  const children: SceneNode[] = [];

  // ベクターにスタイルを適用
  function styleVector(vec: VectorNode): void {
    vec.strokes = [{ type: "SOLID", color }];
    vec.strokeWeight = options.strokeWeight;
    vec.fills = [];
    vec.strokeCap = "ROUND";
    vec.strokeJoin = "ROUND";
    if (options.dashed) {
      vec.dashPattern = [8, 6];
    }
  }

  // 点群からベクターを作成（位置・サイズ設定→パス設定の順）
  function createLineVector(points: Point[], pathDataFn: (sx: number, sy: number) => string): VectorNode {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const sx = Math.min(...xs) - 20;
    const sy = Math.min(...ys) - 20;
    const w = Math.max(...xs) - sx + 40;
    const h = Math.max(...ys) - sy + 40;

    const vec = figma.createVector();
    vec.x = sx;
    vec.y = sy;
    vec.resize(Math.max(w, 1), Math.max(h, 1));
    vec.vectorPaths = [{ windingRule: "NONZERO", data: pathDataFn(sx, sy) }];
    styleVector(vec);
    return vec;
  }

  const doStartArrow = options.startArrow !== false;
  const doEndArrow = options.endArrow !== false;
  const depth = arrowDepth(options.arrowSize);

  function bezierPath(pts: [Point, Point, Point, Point], sx: number, sy: number): string {
    const r = pts.map(p => ({ x: p.x - sx, y: p.y - sy }));
    return `M ${r[0].x} ${r[0].y} C ${r[1].x} ${r[1].y} ${r[2].x} ${r[2].y} ${r[3].x} ${r[3].y}`;
  }

  function polyPath(pts: Point[], sx: number, sy: number): string {
    const r = pts.map(p => ({ x: p.x - sx, y: p.y - sy }));
    let d = `M ${r[0].x} ${r[0].y}`;
    for (let i = 1; i < r.length; i++) d += ` L ${r[i].x} ${r[i].y}`;
    return d;
  }

  // ポリラインの端点を矢じり分短くする
  function shortenPolyline(pts: Point[], fromStart: boolean, amount: number): Point[] {
    if (pts.length < 2) return pts;
    const result = [...pts];
    if (fromStart) {
      const dx = result[1].x - result[0].x;
      const dy = result[1].y - result[0].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > amount) {
        result[0] = { x: result[0].x + (dx / len) * amount, y: result[0].y + (dy / len) * amount };
      }
    } else {
      const last = result.length - 1;
      const dx = result[last].x - result[last - 1].x;
      const dy = result[last].y - result[last - 1].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > amount) {
        result[last] = { x: result[last].x - (dx / len) * amount, y: result[last].y - (dy / len) * amount };
      }
    }
    return result;
  }

  if (options.curved) {
    const { cp1, cp2 } = calcControlPoints(start, end);
    let p0 = start.point, p1 = cp1, p2 = cp2, p3 = end.point;

    // 矢じり分だけ曲線の端を短くするため t をオフセット
    let tStart = 0;
    let tEnd = 1;
    if (doEndArrow) {
      tEnd = findBezierT(p0, p1, p2, p3, 1, depth, -1);
    }
    if (doStartArrow) {
      tStart = findBezierT(p0, p1, p2, p3, 0, depth, 1);
    }

    // 短くした曲線を取得
    // まず終点側を切る → その結果の前半から始点側を切る
    let curvePts: [Point, Point, Point, Point] = [p0, p1, p2, p3];
    if (doEndArrow) {
      curvePts = splitBezier(curvePts[0], curvePts[1], curvePts[2], curvePts[3], tEnd).first;
    }
    if (doStartArrow) {
      const tAdj = doEndArrow ? tStart / tEnd : tStart; // tStart を短くされた範囲に再マッピング
      curvePts = splitBezier(curvePts[0], curvePts[1], curvePts[2], curvePts[3], tAdj).second;
    }

    if (options.label) {
      const mid = bezierPointAndTangent(p0, p1, p2, p3, 0.5);
      const labelNode = await createLabel(mid.point, options.label, color, options.strokeWeight);
      const halfGap = Math.max(labelNode.width, labelNode.height) / 2 + 6;

      const t1 = findBezierT(p0, p1, p2, p3, 0.5, halfGap, -1);
      const t2 = findBezierT(p0, p1, p2, p3, 0.5, halfGap, 1);

      // ギャップ前半: start → t1 (矢じりオフセット込み)
      let seg1 = splitBezier(p0, p1, p2, p3, t1).first;
      if (doStartArrow) {
        const tAdj = tStart / t1;
        seg1 = splitBezier(seg1[0], seg1[1], seg1[2], seg1[3], tAdj).second;
      }

      // ギャップ後半: t2 → end (矢じりオフセット込み)
      let seg2 = splitBezier(p0, p1, p2, p3, t2).second;
      if (doEndArrow) {
        const tAdj = (tEnd - t2) / (1 - t2);
        seg2 = splitBezier(seg2[0], seg2[1], seg2[2], seg2[3], tAdj).first;
      }

      children.push(createLineVector([...seg1], (sx, sy) => bezierPath(seg1, sx, sy)));
      children.push(labelNode);
      children.push(createLineVector([...seg2], (sx, sy) => bezierPath(seg2, sx, sy)));
    } else {
      children.push(createLineVector([...curvePts], (sx, sy) => bezierPath(curvePts, sx, sy)));
    }

    // 矢じり（元の曲線の角度で配置）
    if (doStartArrow) {
      const { angle: startAngle } = bezierPointAndTangent(p0, p1, p2, p3, 0);
      children.push(createArrowhead(start.point, startAngle + Math.PI, options.arrowSize, color));
    }
    if (doEndArrow) {
      const { angle: endAngle } = bezierPointAndTangent(p0, p1, p2, p3, 1);
      children.push(createArrowhead(end.point, endAngle, options.arrowSize, color));
    }

  } else {
    // --- 直角折れ線（エルボー）矢印 ---
    const waypoints = calcElbowPoints(start, end, options.bendPosition ?? 0.5);
    let allPoints = [start.point, ...waypoints, end.point];

    // 矢じり分短くする
    if (doEndArrow) {
      allPoints = shortenPolyline(allPoints, false, depth);
    }
    if (doStartArrow) {
      allPoints = shortenPolyline(allPoints, true, depth);
    }

    if (options.label) {
      const midPt = getPathMidpoint(allPoints);
      const labelNode = await createLabel(midPt, options.label, color, options.strokeWeight);
      const halfGap = Math.max(labelNode.width, labelNode.height) / 2 + 6;

      const { before, after } = splitPolylineAtGap(allPoints, midPt, halfGap);

      if (before.length >= 2) {
        children.push(createLineVector(before, (sx, sy) => polyPath(before, sx, sy)));
      }
      children.push(labelNode);
      if (after.length >= 2) {
        children.push(createLineVector(after, (sx, sy) => polyPath(after, sx, sy)));
      }
    } else {
      children.push(createLineVector(allPoints, (sx, sy) => polyPath(allPoints, sx, sy)));
    }

    // 矢じり（元のポイントの角度で配置）
    const origPoints = [start.point, ...waypoints, end.point];
    if (doEndArrow) {
      const prevPt = origPoints[origPoints.length - 2];
      const endPt = origPoints[origPoints.length - 1];
      const angle = Math.atan2(endPt.y - prevPt.y, endPt.x - prevPt.x);
      children.push(createArrowhead(end.point, angle, options.arrowSize, color));
    }
    if (doStartArrow) {
      const firstPt = origPoints[0];
      const nextPt = origPoints[1];
      const angle = Math.atan2(firstPt.y - nextPt.y, firstPt.x - nextPt.x);
      children.push(createArrowhead(start.point, angle, options.arrowSize, color));
    }
  }

  // 既存グループがあれば中身を入れ替え、なければ新規作成
  let groupNode: GroupNode;

  if (existingGroup) {
    const parent = existingGroup.parent || figma.currentPage;
    const index = existingGroup.parent
      ? Array.from((existingGroup.parent as ChildrenMixin).children).indexOf(existingGroup)
      : -1;

    // 古い矢印のpluginDataを退避
    const savedData = existingGroup.getPluginData(PLUGIN_DATA_KEY);

    // 既存グループを削除して新しいグループを同じ場所に作成
    existingGroup.remove();

    groupNode = figma.group(children, parent as BaseNode & ChildrenMixin);

    // pluginDataを復元（後で上書きされるが念のため）
    if (savedData) {
      groupNode.setPluginData(PLUGIN_DATA_KEY, savedData);
    }
  } else {
    groupNode = figma.group(children, figma.currentPage);
  }

  groupNode.name = `Arrow: ${nodeA.name} → ${nodeB.name}`;

  // メタデータを保存
  const arrowData: ArrowData = {
    sourceId: nodeA.id,
    targetId: nodeB.id,
    options,
  };
  groupNode.setPluginData(PLUGIN_DATA_KEY, JSON.stringify(arrowData));
  groupNode.setRelaunchData({ "refresh-all": "" });

  return groupNode;
}

// 選択されたノードから矢印グループのデータを取得
function getArrowData(node: SceneNode): ArrowData | null {
  const raw = node.getPluginData(PLUGIN_DATA_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArrowData;
  } catch {
    return null;
  }
}

// フレーム系ノードかどうか
function isConnectable(n: SceneNode): boolean {
  return (
    n.type === "FRAME" ||
    n.type === "COMPONENT" ||
    n.type === "INSTANCE" ||
    n.type === "GROUP" ||
    n.type === "SECTION"
  );
}

// 選択状態をUIに送信
function sendSelectionState() {
  const selection = figma.currentPage.selection;

  // 既存の矢印が選択されているかチェック
  if (selection.length === 1) {
    const arrowData = getArrowData(selection[0]);
    if (arrowData) {
      const source = figma.getNodeById(arrowData.sourceId);
      const target = figma.getNodeById(arrowData.targetId);
      figma.ui.postMessage({
        type: "edit-arrow",
        arrowId: selection[0].id,
        sourceName: source ? source.name : "(削除済み)",
        targetName: target ? target.name : "(削除済み)",
        sourceExists: !!source,
        targetExists: !!target,
        options: arrowData.options,
      });
      return;
    }
  }

  // 通常のフレーム選択
  const frames = selection.filter(isConnectable);
  figma.ui.postMessage({
    type: "selection-update",
    frames: frames.map((f) => ({ id: f.id, name: f.name })),
  });
}

// 選択変更の監視
figma.on("selectionchange", sendSelectionState);

// 初期状態送信
sendSelectionState();

// ページにrelaunchボタンを設定
figma.currentPage.setRelaunchData({ "refresh-all": "全矢印の位置を更新" });

// カラースタイル・バリアブルをUIに送信
async function sendColorSwatches() {
  const swatches: { name: string; hex: string; group: string }[] = [];

  // ローカルペイントスタイル
  try {
    const paintStyles = await figma.getLocalPaintStylesAsync();
    for (const style of paintStyles) {
      if (style.paints.length > 0 && style.paints[0].type === "SOLID") {
        const c = style.paints[0].color;
        swatches.push({
          name: style.name,
          hex: rgbToHex(c),
          group: "styles",
        });
      }
    }
  } catch {}

  // カラーバリアブル
  try {
    const colorVars = await figma.variables.getLocalVariablesAsync("COLOR");
    for (const v of colorVars) {
      // デフォルトモードの値を取得
      const collection = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
      if (!collection) continue;
      const modeId = collection.defaultModeId;
      const value = v.valuesByMode[modeId];
      if (value && typeof value === "object" && "r" in value) {
        swatches.push({
          name: v.name,
          hex: rgbToHex(value as RGB),
          group: "variables",
        });
      }
    }
  } catch {}

  figma.ui.postMessage({ type: "color-swatches", swatches });
}

sendColorSwatches();

// --- フレーム移動の自動追従 ---

// frameId → arrowGroupId[] のマッピングを構築
function buildArrowIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const node of figma.currentPage.children) {
    const data = getArrowData(node);
    if (data && node.type === "GROUP") {
      for (const fid of [data.sourceId, data.targetId]) {
        const list = index.get(fid) || [];
        list.push(node.id);
        index.set(fid, list);
      }
    }
  }
  return index;
}

let arrowIndex = buildArrowIndex();
let updateTimer: number | null = null;
let pendingNodeIds = new Set<string>();

// documentchange でフレーム移動を検知
figma.on("documentchange", (event) => {
  for (const change of event.documentChanges) {
    if (change.type === "PROPERTY_CHANGE") {
      const nodeId = change.id;
      if (arrowIndex.has(nodeId)) {
        pendingNodeIds.add(nodeId);
      }
    }
  }

  // 連続的な移動をデバウンス（100ms）
  if (pendingNodeIds.size > 0 && updateTimer === null) {
    updateTimer = setTimeout(async () => {
      const arrowIdsToUpdate = new Set<string>();
      for (const nodeId of pendingNodeIds) {
        const arrowIds = arrowIndex.get(nodeId);
        if (arrowIds) {
          for (const aid of arrowIds) {
            arrowIdsToUpdate.add(aid);
          }
        }
      }
      pendingNodeIds.clear();
      updateTimer = null;

      for (const arrowId of arrowIdsToUpdate) {
        const arrowGroup = figma.getNodeById(arrowId) as GroupNode;
        if (!arrowGroup) continue;
        const data = getArrowData(arrowGroup);
        if (!data) continue;
        const source = figma.getNodeById(data.sourceId) as SceneNode;
        const target = figma.getNodeById(data.targetId) as SceneNode;
        if (!source || !target) continue;
        await drawArrow(source, target, data.options, arrowGroup);
      }

      // インデックスを再構築
      arrowIndex = buildArrowIndex();
    }, 100) as unknown as number;
  }
});

// 全矢印を更新
async function refreshAllArrows(): Promise<number> {
  let count = 0;
  const allNodes = figma.currentPage.children;
  for (const node of allNodes) {
    const arrowData = getArrowData(node);
    if (arrowData && node.type === "GROUP") {
      const source = figma.getNodeById(arrowData.sourceId) as SceneNode;
      const target = figma.getNodeById(arrowData.targetId) as SceneNode;
      if (source && target) {
        await drawArrow(source, target, arrowData.options, node);
        count++;
      }
    }
  }
  arrowIndex = buildArrowIndex();
  return count;
}

// プラグイン起動時に全矢印を自動更新
(async () => {
  const count = await refreshAllArrows();
  if (count > 0) {
    figma.notify(`${count}本の矢印を更新しました`);
  }
  if (isRelaunch) {
    figma.closePlugin();
  }
})();

// UIからのメッセージ処理
figma.ui.onmessage = async (msg) => {
  if (msg.type === "connect") {
    const { sourceId, targetId, color, strokeWeight, curved, arrowSize, dashed, startSide, endSide, label } = msg;

    const source = figma.getNodeById(sourceId) as SceneNode;
    const target = figma.getNodeById(targetId) as SceneNode;

    if (!source || !target) {
      figma.notify("選択したフレームが見つかりません", { error: true });
      return;
    }

    const options: ArrowOptions = { color, strokeWeight, curved, arrowSize, dashed, startSide: startSide || "auto", endSide: endSide || "auto", label: label || "", startArrow: msg.startArrow !== undefined ? msg.startArrow : false, endArrow: msg.endArrow !== undefined ? msg.endArrow : true, bendPosition: msg.bendPosition ?? 0.5 };
    const arrow = await drawArrow(source, target, options);

    figma.currentPage.selection = [arrow];
    figma.viewport.scrollAndZoomIntoView([arrow]);
    arrowIndex = buildArrowIndex();
    figma.notify(`${source.name} → ${target.name} を接続しました`);
  }

  if (msg.type === "update-arrow") {
    const { arrowId, color, strokeWeight, curved, arrowSize, dashed, startSide, endSide, label } = msg;

    const arrowGroup = figma.getNodeById(arrowId) as GroupNode;
    if (!arrowGroup) {
      figma.notify("矢印が見つかりません", { error: true });
      return;
    }

    const arrowData = getArrowData(arrowGroup);
    if (!arrowData) {
      figma.notify("矢印データが破損しています", { error: true });
      return;
    }

    const source = figma.getNodeById(arrowData.sourceId) as SceneNode;
    const target = figma.getNodeById(arrowData.targetId) as SceneNode;

    if (!source || !target) {
      figma.notify("接続先のフレームが削除されています", { error: true });
      return;
    }

    const options: ArrowOptions = { color, strokeWeight, curved, arrowSize, dashed, startSide: startSide || "auto", endSide: endSide || "auto", label: label || "", startArrow: msg.startArrow !== undefined ? msg.startArrow : false, endArrow: msg.endArrow !== undefined ? msg.endArrow : true, bendPosition: msg.bendPosition ?? 0.5 };
    const newArrow = await drawArrow(source, target, options, arrowGroup);

    figma.currentPage.selection = [newArrow];
    arrowIndex = buildArrowIndex();
    figma.notify("矢印を更新しました");
  }

  if (msg.type === "refresh-position") {
    const { arrowId } = msg;

    const arrowGroup = figma.getNodeById(arrowId) as GroupNode;
    if (!arrowGroup) {
      figma.notify("矢印が見つかりません", { error: true });
      return;
    }

    const arrowData = getArrowData(arrowGroup);
    if (!arrowData) {
      figma.notify("矢印データが破損しています", { error: true });
      return;
    }

    const source = figma.getNodeById(arrowData.sourceId) as SceneNode;
    const target = figma.getNodeById(arrowData.targetId) as SceneNode;

    if (!source || !target) {
      figma.notify("接続先のフレームが削除されています", { error: true });
      return;
    }

    const newArrow = await drawArrow(source, target, arrowData.options, arrowGroup);

    figma.currentPage.selection = [newArrow];
    figma.notify("矢印の位置を更新しました");
  }

  if (msg.type === "refresh-all") {
    const count = await refreshAllArrows();
    figma.notify(`${count}本の矢印を更新しました`);
  }

  if (msg.type === "swap-arrow") {
    const { arrowId, color, strokeWeight, curved, arrowSize, dashed, startSide, endSide, label } = msg;

    const arrowGroup = figma.getNodeById(arrowId) as GroupNode;
    if (!arrowGroup) {
      figma.notify("矢印が見つかりません", { error: true });
      return;
    }

    const arrowData = getArrowData(arrowGroup);
    if (!arrowData) {
      figma.notify("矢印データが破損しています", { error: true });
      return;
    }

    // source と target を入れ替えて再描画
    const source = figma.getNodeById(arrowData.targetId) as SceneNode;
    const target = figma.getNodeById(arrowData.sourceId) as SceneNode;

    if (!source || !target) {
      figma.notify("接続先のフレームが削除されています", { error: true });
      return;
    }

    const options: ArrowOptions = { color, strokeWeight, curved, arrowSize, dashed, startSide: startSide || "auto", endSide: endSide || "auto", label: label || "", startArrow: msg.startArrow !== undefined ? msg.startArrow : false, endArrow: msg.endArrow !== undefined ? msg.endArrow : true, bendPosition: msg.bendPosition ?? 0.5 };
    const newArrow = await drawArrow(source, target, options, arrowGroup);

    figma.currentPage.selection = [newArrow];
    arrowIndex = buildArrowIndex();
    figma.notify("始点と終点を入れ替えました");
  }

  if (msg.type === "delete-arrow") {
    const { arrowId } = msg;
    const arrowGroup = figma.getNodeById(arrowId);
    if (arrowGroup) {
      arrowGroup.remove();
      arrowIndex = buildArrowIndex();
      figma.notify("矢印を削除しました");
    }
  }

  if (msg.type === "cancel") {
    figma.closePlugin();
  }
};
