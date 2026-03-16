"use strict";
// Arrow Connector Plugin - FigJam風の矢印でFrameを繋ぐ
figma.showUI(__html__, { width: 320, height: 520 });
const PLUGIN_DATA_KEY = "arrow-connector-data";
// フレームの8接続点を取得（辺の中点4 + 角4）
function getAllConnectionPoints(node) {
    const { x, y, width, height } = node;
    return [
        { point: { x: x + width / 2, y: y }, side: "top" },
        { point: { x: x + width / 2, y: y + height }, side: "bottom" },
        { point: { x: x, y: y + height / 2 }, side: "left" },
        { point: { x: x + width, y: y + height / 2 }, side: "right" },
        { point: { x: x, y: y }, side: "top" }, // top-left
        { point: { x: x + width, y: y }, side: "top" }, // top-right
        { point: { x: x, y: y + height }, side: "bottom" }, // bottom-left
        { point: { x: x + width, y: y + height }, side: "bottom" }, // bottom-right
    ];
}
// 2点間の距離
function distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
// 指定された位置の接続点を取得
function getConnectionPoint(node, side) {
    const { x, y, width, height } = node;
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
function calcElbowPoints(start, end) {
    const s = start.point;
    const e = end.point;
    const gap = 20; // フレームから出る最小距離
    const isHorizontalStart = start.side === "left" || start.side === "right";
    const isHorizontalEnd = end.side === "left" || end.side === "right";
    // 始点の方向に出るオフセット
    function outward(edge, dist) {
        switch (edge.side) {
            case "top": return { x: edge.point.x, y: edge.point.y - dist };
            case "bottom": return { x: edge.point.x, y: edge.point.y + dist };
            case "left": return { x: edge.point.x - dist, y: edge.point.y };
            case "right": return { x: edge.point.x + dist, y: edge.point.y };
        }
    }
    // 同方向（水平→水平 or 垂直→垂直）
    if (isHorizontalStart && isHorizontalEnd) {
        // 両方水平: 中間X座標で折る
        const midX = (s.x + e.x) / 2;
        return [
            { x: midX, y: s.y },
            { x: midX, y: e.y },
        ];
    }
    if (!isHorizontalStart && !isHorizontalEnd) {
        // 両方垂直: 中間Y座標で折る
        const midY = (s.y + e.y) / 2;
        return [
            { x: s.x, y: midY },
            { x: e.x, y: midY },
        ];
    }
    // 異方向（水平→垂直 or 垂直→水平）: 1回折りでOK
    if (isHorizontalStart && !isHorizontalEnd) {
        // 水平スタート、垂直エンド → コーナー点は (e.x, s.y)
        return [{ x: e.x, y: s.y }];
    }
    // 垂直スタート、水平エンド → コーナー点は (s.x, e.y)
    return [{ x: s.x, y: e.y }];
}
// ベジェ曲線の制御点を計算（FigJam風のカーブ）
function calcControlPoints(start, end) {
    const dist = distance(start.point, end.point);
    const offset = Math.min(dist * 0.4, 150);
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
// 矢じり（三角形）を作成
function createArrowhead(tip, angle, size, color) {
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
    // テキストの中心を中間点に合わせる
    label.x = pos.x - label.width / 2;
    label.y = pos.y - label.height / 2;
    return label;
}
// 矢印を描画（新規作成 or 既存グループを再描画）
async function drawArrow(nodeA, nodeB, options, existingGroup) {
    const { start, end } = findConnectionPoints(nodeA, nodeB, options.startSide || "auto", options.endSide || "auto");
    const color = hexToRgb(options.color);
    const children = [];
    if (options.curved) {
        const { cp1, cp2 } = calcControlPoints(start, end);
        const line = figma.createVector();
        const sx = Math.min(start.point.x, end.point.x, cp1.x, cp2.x) - 20;
        const sy = Math.min(start.point.y, end.point.y, cp1.y, cp2.y) - 20;
        const rStart = { x: start.point.x - sx, y: start.point.y - sy };
        const rEnd = { x: end.point.x - sx, y: end.point.y - sy };
        const rCp1 = { x: cp1.x - sx, y: cp1.y - sy };
        const rCp2 = { x: cp2.x - sx, y: cp2.y - sy };
        const w = Math.max(start.point.x, end.point.x, cp1.x, cp2.x) - sx + 40;
        const h = Math.max(start.point.y, end.point.y, cp1.y, cp2.y) - sy + 40;
        line.x = sx;
        line.y = sy;
        line.resize(w, h);
        const pathData = `M ${rStart.x} ${rStart.y} C ${rCp1.x} ${rCp1.y} ${rCp2.x} ${rCp2.y} ${rEnd.x} ${rEnd.y}`;
        line.vectorPaths = [{ windingRule: "NONZERO", data: pathData }];
        line.strokes = [{ type: "SOLID", color }];
        line.strokeWeight = options.strokeWeight;
        line.fills = [];
        line.strokeCap = "ROUND";
        line.strokeJoin = "ROUND";
        if (options.dashed) {
            line.dashPattern = [8, 6];
        }
        children.push(line);
        const { angle } = bezierPointAndTangent(start.point, cp1, cp2, end.point, 1);
        children.push(createArrowhead(end.point, angle, options.arrowSize, color));
        // カーブの中間点にラベル
        if (options.label) {
            const mid = bezierPointAndTangent(start.point, cp1, cp2, end.point, 0.5);
            const labelNode = await createLabel(mid.point, options.label, color, options.strokeWeight);
            children.push(labelNode);
        }
    }
    else {
        // --- 直角折れ線（エルボー）矢印 ---
        const waypoints = calcElbowPoints(start, end);
        const allPoints = [start.point, ...waypoints, end.point];
        // バウンディングボックス計算
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of allPoints) {
            if (p.x < minX)
                minX = p.x;
            if (p.y < minY)
                minY = p.y;
            if (p.x > maxX)
                maxX = p.x;
            if (p.y > maxY)
                maxY = p.y;
        }
        const sx = minX - 20;
        const sy = minY - 20;
        const w = maxX - sx + 40;
        const h = maxY - sy + 40;
        const line = figma.createVector();
        line.x = sx;
        line.y = sy;
        line.resize(Math.max(w, 1), Math.max(h, 1));
        // パス生成
        const rPoints = allPoints.map(p => ({ x: p.x - sx, y: p.y - sy }));
        let pathData = `M ${rPoints[0].x} ${rPoints[0].y}`;
        for (let i = 1; i < rPoints.length; i++) {
            pathData += ` L ${rPoints[i].x} ${rPoints[i].y}`;
        }
        line.vectorPaths = [{ windingRule: "NONZERO", data: pathData }];
        line.strokes = [{ type: "SOLID", color }];
        line.strokeWeight = options.strokeWeight;
        line.fills = [];
        line.strokeCap = "ROUND";
        line.strokeJoin = "ROUND";
        if (options.dashed) {
            line.dashPattern = [8, 6];
        }
        children.push(line);
        // 矢じりの角度は最後のセグメントから算出
        const lastSeg = rPoints.length;
        const prevPt = allPoints[allPoints.length - 2];
        const endPt = allPoints[allPoints.length - 1];
        const angle = Math.atan2(endPt.y - prevPt.y, endPt.x - prevPt.x);
        children.push(createArrowhead(end.point, angle, options.arrowSize, color));
        // エルボーの中間点にラベル
        if (options.label) {
            const midPt = getPathMidpoint(allPoints);
            const labelNode = await createLabel(midPt, options.label, color, options.strokeWeight);
            children.push(labelNode);
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
// フレーム系ノードかどうか
function isConnectable(n) {
    return (n.type === "FRAME" ||
        n.type === "COMPONENT" ||
        n.type === "INSTANCE" ||
        n.type === "GROUP" ||
        n.type === "SECTION");
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
// UIからのメッセージ処理
figma.ui.onmessage = async (msg) => {
    if (msg.type === "connect") {
        const { sourceId, targetId, color, strokeWeight, curved, arrowSize, dashed, startSide, endSide, label } = msg;
        const source = figma.getNodeById(sourceId);
        const target = figma.getNodeById(targetId);
        if (!source || !target) {
            figma.notify("選択したフレームが見つかりません", { error: true });
            return;
        }
        const options = { color, strokeWeight, curved, arrowSize, dashed, startSide: startSide || "auto", endSide: endSide || "auto", label: label || "" };
        const arrow = await drawArrow(source, target, options);
        figma.currentPage.selection = [arrow];
        figma.notify(`${source.name} → ${target.name} を接続しました`);
    }
    if (msg.type === "update-arrow") {
        const { arrowId, color, strokeWeight, curved, arrowSize, dashed, startSide, endSide, label } = msg;
        const arrowGroup = figma.getNodeById(arrowId);
        if (!arrowGroup) {
            figma.notify("矢印が見つかりません", { error: true });
            return;
        }
        const arrowData = getArrowData(arrowGroup);
        if (!arrowData) {
            figma.notify("矢印データが破損しています", { error: true });
            return;
        }
        const source = figma.getNodeById(arrowData.sourceId);
        const target = figma.getNodeById(arrowData.targetId);
        if (!source || !target) {
            figma.notify("接続先のフレームが削除されています", { error: true });
            return;
        }
        const options = { color, strokeWeight, curved, arrowSize, dashed, startSide: startSide || "auto", endSide: endSide || "auto", label: label || "" };
        const newArrow = await drawArrow(source, target, options, arrowGroup);
        figma.currentPage.selection = [newArrow];
        figma.notify("矢印を更新しました");
    }
    if (msg.type === "refresh-position") {
        const { arrowId } = msg;
        const arrowGroup = figma.getNodeById(arrowId);
        if (!arrowGroup) {
            figma.notify("矢印が見つかりません", { error: true });
            return;
        }
        const arrowData = getArrowData(arrowGroup);
        if (!arrowData) {
            figma.notify("矢印データが破損しています", { error: true });
            return;
        }
        const source = figma.getNodeById(arrowData.sourceId);
        const target = figma.getNodeById(arrowData.targetId);
        if (!source || !target) {
            figma.notify("接続先のフレームが削除されています", { error: true });
            return;
        }
        const newArrow = await drawArrow(source, target, arrowData.options, arrowGroup);
        figma.currentPage.selection = [newArrow];
        figma.notify("矢印の位置を更新しました");
    }
    if (msg.type === "refresh-all") {
        let count = 0;
        const allNodes = figma.currentPage.children;
        for (const node of allNodes) {
            const arrowData = getArrowData(node);
            if (arrowData && node.type === "GROUP") {
                const source = figma.getNodeById(arrowData.sourceId);
                const target = figma.getNodeById(arrowData.targetId);
                if (source && target) {
                    await drawArrow(source, target, arrowData.options, node);
                    count++;
                }
            }
        }
        figma.notify(`${count}本の矢印を更新しました`);
    }
    if (msg.type === "swap-arrow") {
        const { arrowId, color, strokeWeight, curved, arrowSize, dashed, startSide, endSide, label } = msg;
        const arrowGroup = figma.getNodeById(arrowId);
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
        const source = figma.getNodeById(arrowData.targetId);
        const target = figma.getNodeById(arrowData.sourceId);
        if (!source || !target) {
            figma.notify("接続先のフレームが削除されています", { error: true });
            return;
        }
        const options = { color, strokeWeight, curved, arrowSize, dashed, startSide: startSide || "auto", endSide: endSide || "auto", label: label || "" };
        const newArrow = await drawArrow(source, target, options, arrowGroup);
        figma.currentPage.selection = [newArrow];
        figma.notify("始点と終点を入れ替えました");
    }
    if (msg.type === "delete-arrow") {
        const { arrowId } = msg;
        const arrowGroup = figma.getNodeById(arrowId);
        if (arrowGroup) {
            arrowGroup.remove();
            figma.notify("矢印を削除しました");
        }
    }
    if (msg.type === "cancel") {
        figma.closePlugin();
    }
};
