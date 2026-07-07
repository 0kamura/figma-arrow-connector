"use strict";
// Arrow Connector Plugin - FigJam風の矢印でFrameを繋ぐ
const isRelaunch = figma.command === "refresh-all";
figma.showUI(__html__, { width: 340, height: 586, themeColors: true, visible: !isRelaunch });
const PLUGIN_DATA_KEY = "arrow-connector-data";
// ノードの絶対座標バウンディングボックスを取得
function getAbsBounds(node) {
    const bb = node.absoluteBoundingBox;
    if (bb)
        return bb;
    // fallback (absoluteBoundingBox が null の場合)
    return { x: node.x, y: node.y, width: node.width, height: node.height };
}
// フレームの4接続点（各辺の中点）を取得
function getAllConnectionPoints(node) {
    const { x, y, width, height } = getAbsBounds(node);
    return [
        { point: { x: x + width / 2, y: y }, side: "top" },
        { point: { x: x + width / 2, y: y + height }, side: "bottom" },
        { point: { x: x, y: y + height / 2 }, side: "left" },
        { point: { x: x + width, y: y + height / 2 }, side: "right" },
    ];
}
// 2点間の距離
function distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
// 指定された位置の接続点を取得
function getConnectionPoint(node, side) {
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
function findConnectionPoints(nodeA, nodeB, startSide, endSide) {
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
            if (d < minDist) {
                minDist = d;
                bestEnd = b;
            }
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
            if (d < minDist) {
                minDist = d;
                bestStart = a;
            }
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
            if (d < minDist) {
                minDist = d;
                bestStart = a;
                bestEnd = b;
            }
        }
    }
    return { start: bestStart, end: bestEnd };
}
// 直角折れ線の中間点を計算
// style: "L" = 1折り（L字、異方向のみ）, "Z" = 2折り以上（同方向Z字 or 異方向階段）
// bendPosition (0~1) は Z字／階段の折れ位置を制御。L字では無視。
function calcElbowPoints(start, end, bendPosition = 0.5, style = "L") {
    const s = start.point;
    const e = end.point;
    const t = Math.max(0.05, Math.min(0.95, bendPosition));
    const isHorizontalStart = start.side === "left" || start.side === "right";
    const isHorizontalEnd = end.side === "left" || end.side === "right";
    // 同方向（水平→水平 or 垂直→垂直）: 必ず2折りZ字（1折りでは繋がらない）
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
    // 異方向（水平⇄垂直）
    if (style === "L") {
        // 1折りL字: side制約から角は1点のみ
        if (isHorizontalStart && !isHorizontalEnd) {
            // 水平→垂直: 角は (e.x, s.y)
            return [{ x: e.x, y: s.y }];
        }
        // 垂直→水平: 角は (s.x, e.y)
        return [{ x: s.x, y: e.y }];
    }
    // style === "Z" → 階段状（3折り）。bendPosition で折れ点を制御。
    if (isHorizontalStart && !isHorizontalEnd) {
        const bendX = s.x + (e.x - s.x) * t;
        const bendY = s.y + (e.y - s.y) * (1 - t);
        return [
            { x: bendX, y: s.y },
            { x: bendX, y: bendY },
            { x: e.x, y: bendY },
        ];
    }
    const bendY = s.y + (e.y - s.y) * t;
    const bendX = s.x + (e.x - s.x) * (1 - t);
    return [
        { x: s.x, y: bendY },
        { x: bendX, y: bendY },
        { x: bendX, y: e.y },
    ];
}
// ベジェ曲線の制御点を計算（FigJam風のカーブ）
function calcControlPoints(start, end) {
    const dist = distance(start.point, end.point);
    const offset = Math.min(dist * 0.25, 80);
    function applyOffset(edge, dir) {
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
function bezierPointAndTangent(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const point = {
        x: mt * mt * mt * p0.x +
            3 * mt * mt * t * p1.x +
            3 * mt * t * t * p2.x +
            t * t * t * p3.x,
        y: mt * mt * mt * p0.y +
            3 * mt * mt * t * p1.y +
            3 * mt * t * t * p2.y +
            t * t * t * p3.y,
    };
    const tx = 3 * mt * mt * (p1.x - p0.x) +
        6 * mt * t * (p2.x - p1.x) +
        3 * t * t * (p3.x - p2.x);
    const ty = 3 * mt * mt * (p1.y - p0.y) +
        6 * mt * t * (p2.y - p1.y) +
        3 * t * t * (p3.y - p2.y);
    return { point, angle: Math.atan2(ty, tx) };
}
// strokeCapの種類を決定
function arrowCap(value) {
    if (typeof value === 'boolean')
        return value ? "ARROW_EQUILATERAL" : "NONE";
    switch (value) {
        case 'arrow': return "ARROW_EQUILATERAL";
        case 'triangle': return "TRIANGLE_FILLED";
        case 'circle': return "CIRCLE_FILLED";
        case 'diamond': return "DIAMOND_FILLED";
        case 'line': return "ARROW_LINES";
        default: return "NONE";
    }
}
// HEX → RGB変換
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
}
// RGB → HEX変換
function rgbToHex(color) {
    const toHex = (v) => Math.round(v * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}
// 折れ線パスの中間点を求める
function getPathMidpoint(points) {
    // 全セグメントの長さを計算
    let totalLength = 0;
    const segLengths = [];
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
function splitBezier(p0, p1, p2, p3, t) {
    const lerp = (a, b, t) => ({
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
function findBezierT(p0, p1, p2, p3, midT, halfGap, direction) {
    let lo = direction === -1 ? 0 : midT;
    let hi = direction === -1 ? midT : 1;
    const midPt = bezierPointAndTangent(p0, p1, p2, p3, midT).point;
    for (let i = 0; i < 20; i++) {
        const t = (lo + hi) / 2;
        const pt = bezierPointAndTangent(p0, p1, p2, p3, t).point;
        const d = distance(midPt, pt);
        if (d < halfGap) {
            if (direction === -1)
                hi = t;
            else
                lo = t;
        }
        else {
            if (direction === -1)
                lo = t;
            else
                hi = t;
        }
    }
    return (lo + hi) / 2;
}
// 折れ線のパスにギャップを作る
function splitPolylineAtGap(points, gapCenter, halfGap) {
    // パス上の累積距離を計算
    const dists = [0];
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
        if (segLen === 0)
            continue;
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
    function pointAtDist(targetDist) {
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
    const before = [points[0]];
    for (let i = 1; i < points.length; i++) {
        if (dists[i] <= gapStart) {
            before.push(points[i]);
        }
        else {
            before.push(pointAtDist(gapStart));
            break;
        }
    }
    // after: gapEnd → end
    const afterStart = pointAtDist(gapEnd);
    const after = [afterStart];
    for (let i = 1; i < points.length; i++) {
        if (dists[i] > gapEnd) {
            after.push(points[i]);
        }
    }
    return { before, after };
}
// ラベルテキストを作成
async function createLabel(pos, text, color, strokeWeight) {
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
async function drawArrow(nodeA, nodeB, options, existingGroup) {
    var _a;
    const { start, end } = findConnectionPoints(nodeA, nodeB, options.startSide || "auto", options.endSide || "auto");
    const color = hexToRgb(options.color);
    const children = [];
    // ベクターにスタイルを適用
    function styleVector(vec) {
        vec.strokes = [{ type: "SOLID", color }];
        vec.strokeWeight = options.strokeWeight;
        vec.fills = [];
        vec.strokeJoin = "ROUND";
        if (options.dashed) {
            vec.dashPattern = [8, 6];
        }
    }
    const startCap = arrowCap(options.startArrow);
    const endCap = arrowCap(options.endArrow);
    // 折れ線（ポリライン）をvectorNetworkで作成
    function createPolyVector(points, sCapOverride, eCapOverride) {
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
        const vertices = points.map((p, i) => ({
            x: p.x - sx,
            y: p.y - sy,
            strokeCap: i === 0 ? (sCapOverride !== null && sCapOverride !== void 0 ? sCapOverride : startCap) : i === points.length - 1 ? (eCapOverride !== null && eCapOverride !== void 0 ? eCapOverride : endCap) : "NONE",
        }));
        const segments = [];
        for (let i = 0; i < points.length - 1; i++) {
            segments.push({ start: i, end: i + 1 });
        }
        vec.vectorNetwork = { vertices, segments, regions: [] };
        styleVector(vec);
        return vec;
    }
    // ベジェ曲線をvectorNetworkで作成
    function createBezierVector(p0, cp1, cp2, p3, sCapOverride, eCapOverride) {
        const allPts = [p0, cp1, cp2, p3];
        const xs = allPts.map(p => p.x);
        const ys = allPts.map(p => p.y);
        const sx = Math.min(...xs) - 20;
        const sy = Math.min(...ys) - 20;
        const w = Math.max(...xs) - sx + 40;
        const h = Math.max(...ys) - sy + 40;
        const vec = figma.createVector();
        vec.x = sx;
        vec.y = sy;
        vec.resize(Math.max(w, 1), Math.max(h, 1));
        const v0 = { x: p0.x - sx, y: p0.y - sy };
        const v3 = { x: p3.x - sx, y: p3.y - sy };
        const c1 = { x: cp1.x - sx, y: cp1.y - sy };
        const c2 = { x: cp2.x - sx, y: cp2.y - sy };
        vec.vectorNetwork = {
            vertices: [
                { x: v0.x, y: v0.y, strokeCap: sCapOverride !== null && sCapOverride !== void 0 ? sCapOverride : startCap },
                { x: v3.x, y: v3.y, strokeCap: eCapOverride !== null && eCapOverride !== void 0 ? eCapOverride : endCap },
            ],
            segments: [{
                    start: 0,
                    end: 1,
                    tangentStart: { x: c1.x - v0.x, y: c1.y - v0.y },
                    tangentEnd: { x: c2.x - v3.x, y: c2.y - v3.y },
                }],
            regions: [],
        };
        styleVector(vec);
        return vec;
    }
    // lineType の正規化と elbow style の決定
    // 旧 'elbow' は L字（1折り）として扱う
    let effectiveLineType = options.lineType || (options.curved ? 'curve' : 'elbow-l');
    if (effectiveLineType === 'elbow')
        effectiveLineType = 'elbow-l';
    const elbowStyle = effectiveLineType === 'elbow-z' ? 'Z' : 'L';
    const isElbow = effectiveLineType === 'elbow-l' || effectiveLineType === 'elbow-z';
    if (effectiveLineType === 'curve') {
        const { cp1, cp2 } = calcControlPoints(start, end);
        const p0 = start.point, p1 = cp1, p2 = cp2, p3 = end.point;
        if (options.label) {
            const mid = bezierPointAndTangent(p0, p1, p2, p3, 0.5);
            const labelNode = await createLabel(mid.point, options.label, color, options.strokeWeight);
            const halfGap = Math.max(labelNode.width, labelNode.height) / 2 + 6;
            const t1 = findBezierT(p0, p1, p2, p3, 0.5, halfGap, -1);
            const t2 = findBezierT(p0, p1, p2, p3, 0.5, halfGap, 1);
            const seg1 = splitBezier(p0, p1, p2, p3, t1).first;
            const seg2 = splitBezier(p0, p1, p2, p3, t2).second;
            children.push(createBezierVector(seg1[0], seg1[1], seg1[2], seg1[3], startCap, "NONE"));
            children.push(labelNode);
            children.push(createBezierVector(seg2[0], seg2[1], seg2[2], seg2[3], "NONE", endCap));
        }
        else {
            children.push(createBezierVector(p0, p1, p2, p3));
        }
    }
    else if (effectiveLineType === 'straight') {
        // --- 直線 ---
        const allPoints = [start.point, end.point];
        if (options.label) {
            const midPt = getPathMidpoint(allPoints);
            const labelNode = await createLabel(midPt, options.label, color, options.strokeWeight);
            const halfGap = Math.max(labelNode.width, labelNode.height) / 2 + 6;
            const { before, after } = splitPolylineAtGap(allPoints, midPt, halfGap);
            if (before.length >= 2) {
                children.push(createPolyVector(before, startCap, "NONE"));
            }
            children.push(labelNode);
            if (after.length >= 2) {
                children.push(createPolyVector(after, "NONE", endCap));
            }
        }
        else {
            children.push(createPolyVector(allPoints));
        }
    }
    else {
        // --- 直角折れ線（エルボー）矢印 ---
        const waypoints = calcElbowPoints(start, end, (_a = options.bendPosition) !== null && _a !== void 0 ? _a : 0.5, elbowStyle);
        const allPoints = [start.point, ...waypoints, end.point];
        if (options.label) {
            const midPt = getPathMidpoint(allPoints);
            const labelNode = await createLabel(midPt, options.label, color, options.strokeWeight);
            const halfGap = Math.max(labelNode.width, labelNode.height) / 2 + 6;
            const { before, after } = splitPolylineAtGap(allPoints, midPt, halfGap);
            if (before.length >= 2) {
                children.push(createPolyVector(before, startCap, "NONE"));
            }
            children.push(labelNode);
            if (after.length >= 2) {
                children.push(createPolyVector(after, "NONE", endCap));
            }
        }
        else {
            children.push(createPolyVector(allPoints));
        }
    }
    // 既存グループがあれば中身を入れ替え、なければ新規作成
    let groupNode;
    if (existingGroup) {
        const parent = existingGroup.parent || figma.currentPage;
        const index = existingGroup.parent
            ? Array.from(existingGroup.parent.children).indexOf(existingGroup)
            : -1;
        // 古い矢印のpluginDataを退避
        const savedData = existingGroup.getPluginData(PLUGIN_DATA_KEY);
        // 既存グループを削除して新しいグループを同じ場所に作成
        existingGroup.remove();
        groupNode = figma.group(children, parent);
        // 元の z-index 位置に戻す（figma.group は親末尾に追加されるため）
        if (index >= 0 && "insertChild" in parent) {
            try {
                parent.insertChild(index, groupNode);
            }
            catch (_b) { }
        }
        // pluginDataを復元（後で上書きされるが念のため）
        if (savedData) {
            groupNode.setPluginData(PLUGIN_DATA_KEY, savedData);
        }
    }
    else {
        groupNode = figma.group(children, figma.currentPage);
    }
    groupNode.name = `Arrow: ${nodeA.name} → ${nodeB.name}`;
    // メタデータを保存
    const arrowData = {
        sourceId: nodeA.id,
        targetId: nodeB.id,
        options,
    };
    groupNode.setPluginData(PLUGIN_DATA_KEY, JSON.stringify(arrowData));
    groupNode.setRelaunchData({ "refresh-all": "" });
    return groupNode;
}
// 選択されたノードから矢印グループのデータを取得
function getArrowData(node) {
    const raw = node.getPluginData(PLUGIN_DATA_KEY);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch (_a) {
        return null;
    }
}
// 接続可能なノードか（フレーム系 + シェイプ/テキスト等のオブジェクト）
function isConnectable(n) {
    // プラグインが作った矢印グループ自身は除外
    if (getArrowData(n))
        return false;
    switch (n.type) {
        case "FRAME":
        case "COMPONENT":
        case "COMPONENT_SET":
        case "INSTANCE":
        case "GROUP":
        case "SECTION":
        case "TEXT":
        case "RECTANGLE":
        case "ELLIPSE":
        case "POLYGON":
        case "STAR":
        case "LINE":
        case "VECTOR":
        case "BOOLEAN_OPERATION":
        case "STICKY":
        case "SHAPE_WITH_TEXT":
            return true;
        default:
            return false;
    }
}
// 2フレーム間の既存矢印を検索（どちら向きでもマッチ、セクション/フレーム内にネストしていても対象）
function findExistingArrow(idA, idB) {
    const arrowGroups = figma.currentPage.findAllWithCriteria({
        types: ["GROUP"],
        pluginData: { keys: [PLUGIN_DATA_KEY] },
    });
    for (const node of arrowGroups) {
        const data = getArrowData(node);
        if (data) {
            if ((data.sourceId === idA && data.targetId === idB) ||
                (data.sourceId === idB && data.targetId === idA)) {
                return node;
            }
        }
    }
    return null;
}
// 選択状態をUIに送信
async function sendSelectionState() {
    const selection = figma.currentPage.selection;
    // 既存の矢印が選択されているかチェック
    if (selection.length === 1) {
        const arrowData = getArrowData(selection[0]);
        if (arrowData) {
            const source = await figma.getNodeByIdAsync(arrowData.sourceId);
            const target = await figma.getNodeByIdAsync(arrowData.targetId);
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
    // 2フレーム選択時は自動で最適な接続位置を計算して送る
    let autoStartSide = "auto";
    let autoEndSide = "auto";
    if (frames.length >= 2) {
        const { start, end } = findConnectionPoints(frames[0], frames[1], "auto", "auto");
        autoStartSide = start.side;
        autoEndSide = end.side;
    }
    figma.ui.postMessage({
        type: "selection-update",
        frames: frames.map((f) => ({ id: f.id, name: f.name })),
        autoStartSide,
        autoEndSide,
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
    const swatches = [];
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
    }
    catch (_a) { }
    // カラーバリアブル
    try {
        const colorVars = await figma.variables.getLocalVariablesAsync("COLOR");
        for (const v of colorVars) {
            const collection = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
            if (!collection)
                continue;
            const modeId = collection.defaultModeId;
            const value = v.valuesByMode[modeId];
            if (value && typeof value === "object" && "r" in value) {
                swatches.push({
                    name: v.name,
                    hex: rgbToHex(value),
                    group: "variables",
                });
            }
        }
    }
    catch (_b) { }
    // ページ内で使われている色を収集
    const pageColors = new Set();
    function collectColors(node) {
        // 矢印グループ（とその子）はスキップ
        if (getArrowData(node))
            return;
        if ("fills" in node) {
            const fills = node.fills;
            if (Array.isArray(fills)) {
                for (const fill of fills) {
                    if (fill.type === "SOLID" && fill.visible !== false) {
                        pageColors.add(rgbToHex(fill.color));
                    }
                }
            }
        }
        if ("strokes" in node) {
            const strokes = node.strokes;
            if (Array.isArray(strokes)) {
                for (const stroke of strokes) {
                    if (stroke.type === "SOLID" && stroke.visible !== false) {
                        pageColors.add(rgbToHex(stroke.color));
                    }
                }
            }
        }
        if ("children" in node) {
            for (const child of node.children) {
                collectColors(child);
            }
        }
    }
    try {
        for (const child of figma.currentPage.children) {
            collectColors(child);
        }
    }
    catch (_c) { }
    const pageSwatches = Array.from(pageColors).map((hex) => ({
        name: hex,
        hex,
        group: "page",
    }));
    figma.ui.postMessage({ type: "color-swatches", swatches, pageSwatches });
}
sendColorSwatches();
// --- フレーム移動の自動追従 ---
// frameId → arrowGroupId[] のマッピングを構築（ネストした矢印グループも対象）
function buildArrowIndex() {
    const index = new Map();
    const snapshot = figma.currentPage.findAllWithCriteria({
        types: ["GROUP"],
        pluginData: { keys: [PLUGIN_DATA_KEY] },
    });
    for (const node of snapshot) {
        const data = getArrowData(node);
        if (data) {
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
let updateTimer = null;
let pendingNodeIds = new Set();
// 現在ページに張っている nodechange リスナー（ページ切り替え時に張り替える）
let nodeChangeListenerPage = null;
function handleNodeChange(event) {
    for (const change of event.nodeChanges) {
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
            const arrowIdsToUpdate = new Set();
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
            // 現在の選択を保持（再描画で古いグループが消えるため）
            const selectedIds = new Set(figma.currentPage.selection.map(n => n.id));
            const newSelection = [];
            for (const arrowId of arrowIdsToUpdate) {
                try {
                    const arrowGroup = await figma.getNodeByIdAsync(arrowId);
                    if (!arrowGroup)
                        continue;
                    const data = getArrowData(arrowGroup);
                    if (!data)
                        continue;
                    const source = await figma.getNodeByIdAsync(data.sourceId);
                    const target = await figma.getNodeByIdAsync(data.targetId);
                    if (!source || !target)
                        continue;
                    const wasSelected = selectedIds.has(arrowId);
                    const newArrow = await drawArrow(source, target, data.options, arrowGroup);
                    if (wasSelected) {
                        newSelection.push(newArrow);
                    }
                    // インデックスを増分更新（drawArrowは古いグループを削除し新しいグループを作るため、
                    // sourceId/targetIdに対応するエントリ内の古いarrowIdを新しいIDへ差し替える）
                    for (const fid of [data.sourceId, data.targetId]) {
                        const list = arrowIndex.get(fid);
                        if (list) {
                            const idx = list.indexOf(arrowId);
                            if (idx !== -1) {
                                list[idx] = newArrow.id;
                            }
                            else {
                                list.push(newArrow.id);
                            }
                        }
                        else {
                            arrowIndex.set(fid, [newArrow.id]);
                        }
                    }
                }
                catch (e) {
                    console.error("Auto-update arrow failed:", e);
                }
            }
            // 再描画された矢印が選択されていた場合、新しいグループを選択し直す
            if (newSelection.length > 0) {
                // 元の選択から再描画されなかったノードも保持
                const remainingSelection = figma.currentPage.selection.filter(n => !selectedIds.has(n.id) || !arrowIdsToUpdate.has(n.id));
                figma.currentPage.selection = [...remainingSelection, ...newSelection];
            }
        }, 100);
    }
}
// nodechange リスナーを現在ページに張る（張り替え時は前のページから外す）
function attachNodeChangeListener() {
    if (nodeChangeListenerPage) {
        try {
            nodeChangeListenerPage.off("nodechange", handleNodeChange);
        }
        catch (_a) { }
    }
    figma.currentPage.on("nodechange", handleNodeChange);
    nodeChangeListenerPage = figma.currentPage;
}
attachNodeChangeListener();
// ページ切り替え時にリスナーを張り直し、進行中のデバウンスとインデックスをリセットする
figma.on("currentpagechange", () => {
    pendingNodeIds.clear();
    if (updateTimer !== null) {
        clearTimeout(updateTimer);
        updateTimer = null;
    }
    attachNodeChangeListener();
    arrowIndex = buildArrowIndex();
});
// 全矢印を更新（ネストした矢印グループも対象）
async function refreshAllArrows() {
    let count = 0;
    // 走査中に drawArrow が新しいグループを作成するため、
    // 必ずスナップショットをイテレートする（ライブ参照だと無限ループの危険）
    const snapshot = figma.currentPage.findAllWithCriteria({
        types: ["GROUP"],
        pluginData: { keys: [PLUGIN_DATA_KEY] },
    });
    const processed = new Set();
    for (const node of snapshot) {
        try {
            if (processed.has(node.id))
                continue;
            processed.add(node.id);
            const arrowData = getArrowData(node);
            if (arrowData) {
                const source = await figma.getNodeByIdAsync(arrowData.sourceId);
                const target = await figma.getNodeByIdAsync(arrowData.targetId);
                if (source && target) {
                    await drawArrow(source, target, arrowData.options, node);
                    count++;
                }
            }
        }
        catch (e) {
            console.error("refreshArrow failed for node:", node.id, e);
        }
    }
    arrowIndex = buildArrowIndex();
    return count;
}
// プラグイン起動時に全矢印を自動更新
(async () => {
    let count = 0;
    let errored = false;
    try {
        count = await refreshAllArrows();
    }
    catch (e) {
        console.error("refreshAllArrows failed:", e);
        errored = true;
    }
    if (isRelaunch) {
        // relaunch実行時は closePlugin するとnotifyのトーストが消えるため、
        // closePlugin のメッセージ引数で結果を伝える
        if (errored) {
            figma.closePlugin("矢印の更新中にエラーが発生しました");
        }
        else if (count > 0) {
            figma.closePlugin(`${count}本の矢印を更新しました`);
        }
        else {
            figma.closePlugin("更新対象の矢印が見つかりません");
        }
        return;
    }
    if (errored) {
        figma.notify("矢印の更新中にエラーが発生しました", { error: true });
    }
    else if (count > 0) {
        figma.notify(`${count}本の矢印を更新しました`);
    }
})();
// UIからのメッセージ処理
figma.ui.onmessage = async (msg) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        if (msg.type === "connect") {
            const { sourceId, targetId, color, strokeWeight, curved, arrowSize, dashed, startSide, endSide, label } = msg;
            const source = await figma.getNodeByIdAsync(sourceId);
            const target = await figma.getNodeByIdAsync(targetId);
            if (!source || !target) {
                figma.notify("選択したフレームが見つかりません", { error: true });
                return;
            }
            const options = { color, strokeWeight, lineType: msg.lineType || (curved ? 'curve' : 'elbow'), curved, dashed, startSide: startSide || "auto", endSide: endSide || "auto", label: label || "", startArrow: (_a = msg.startArrow) !== null && _a !== void 0 ? _a : 'none', endArrow: (_b = msg.endArrow) !== null && _b !== void 0 ? _b : 'arrow', bendPosition: (_c = msg.bendPosition) !== null && _c !== void 0 ? _c : 0.5 };
            // 既に同じペアの矢印があれば再描画して更新（重複生成を防ぐ）
            const existing = findExistingArrow(sourceId, targetId);
            const existingGroup = existing && existing.type === "GROUP" ? existing : undefined;
            const arrow = await drawArrow(source, target, options, existingGroup);
            figma.currentPage.selection = [arrow];
            arrowIndex = buildArrowIndex();
            figma.notify(existingGroup
                ? `${source.name} → ${target.name} を更新しました`
                : `${source.name} → ${target.name} を接続しました`);
        }
        if (msg.type === "update-arrow") {
            const { arrowId, color, strokeWeight, curved, arrowSize, dashed, startSide, endSide, label } = msg;
            const arrowGroup = await figma.getNodeByIdAsync(arrowId);
            if (!arrowGroup) {
                figma.notify("矢印が見つかりません", { error: true });
                return;
            }
            const arrowData = getArrowData(arrowGroup);
            if (!arrowData) {
                figma.notify("矢印データが破損しています", { error: true });
                return;
            }
            const source = await figma.getNodeByIdAsync(arrowData.sourceId);
            const target = await figma.getNodeByIdAsync(arrowData.targetId);
            if (!source || !target) {
                figma.notify("接続先のフレームが削除されています", { error: true });
                return;
            }
            const options = { color, strokeWeight, lineType: msg.lineType || (curved ? 'curve' : 'elbow'), curved, dashed, startSide: startSide || "auto", endSide: endSide || "auto", label: label || "", startArrow: (_d = msg.startArrow) !== null && _d !== void 0 ? _d : 'none', endArrow: (_e = msg.endArrow) !== null && _e !== void 0 ? _e : 'arrow', bendPosition: (_f = msg.bendPosition) !== null && _f !== void 0 ? _f : 0.5 };
            const newArrow = await drawArrow(source, target, options, arrowGroup);
            figma.currentPage.selection = [newArrow];
            arrowIndex = buildArrowIndex();
            figma.notify("矢印を更新しました");
        }
        if (msg.type === "refresh-position") {
            const { arrowId } = msg;
            const arrowGroup = await figma.getNodeByIdAsync(arrowId);
            if (!arrowGroup) {
                figma.notify("矢印が見つかりません", { error: true });
                return;
            }
            const arrowData = getArrowData(arrowGroup);
            if (!arrowData) {
                figma.notify("矢印データが破損しています", { error: true });
                return;
            }
            const source = await figma.getNodeByIdAsync(arrowData.sourceId);
            const target = await figma.getNodeByIdAsync(arrowData.targetId);
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
            if (count === 0) {
                figma.notify("更新対象の矢印が見つかりません");
            }
            else {
                figma.notify(`${count}本の矢印を更新しました`);
            }
        }
        if (msg.type === "swap-arrow") {
            const { arrowId, color, strokeWeight, curved, arrowSize, dashed, startSide, endSide, label } = msg;
            const arrowGroup = await figma.getNodeByIdAsync(arrowId);
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
            const source = await figma.getNodeByIdAsync(arrowData.targetId);
            const target = await figma.getNodeByIdAsync(arrowData.sourceId);
            if (!source || !target) {
                figma.notify("接続先のフレームが削除されています", { error: true });
                return;
            }
            const options = { color, strokeWeight, lineType: msg.lineType || (curved ? 'curve' : 'elbow'), curved, dashed, startSide: startSide || "auto", endSide: endSide || "auto", label: label || "", startArrow: (_g = msg.startArrow) !== null && _g !== void 0 ? _g : 'none', endArrow: (_h = msg.endArrow) !== null && _h !== void 0 ? _h : 'arrow', bendPosition: (_j = msg.bendPosition) !== null && _j !== void 0 ? _j : 0.5 };
            const newArrow = await drawArrow(source, target, options, arrowGroup);
            figma.currentPage.selection = [newArrow];
            arrowIndex = buildArrowIndex();
            figma.notify("始点と終点を入れ替えました");
        }
        if (msg.type === "delete-arrow") {
            const { arrowId } = msg;
            const arrowGroup = await figma.getNodeByIdAsync(arrowId);
            if (arrowGroup) {
                arrowGroup.remove();
                arrowIndex = buildArrowIndex();
                figma.notify("矢印を削除しました");
            }
        }
        if (msg.type === "resize") {
            const w = Math.max(200, Math.min(800, Number(msg.width) || 340));
            const h = Math.max(80, Math.min(800, Number(msg.height) || 586));
            figma.ui.resize(w, h);
        }
        if (msg.type === "cancel") {
            figma.closePlugin();
        }
    }
    catch (e) {
        console.error("onmessage error:", e);
        figma.notify("エラーが発生しました: " + (e instanceof Error ? e.message : String(e)), { error: true });
    }
};
