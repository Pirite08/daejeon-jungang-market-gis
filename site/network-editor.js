(function () {
  const network = {
    nodes: [],
    edges: [],
    editMode: false,
    tool: "select",
    selectedNodeId: null,
    selectedEdgeId: null,
    pendingEdgeNodeId: null,
    nodeLayer: null,
    edgeLayer: null,
    validation: null,
  };

  const originalRenderActiveRoute = renderActiveRoute;
  const routeCostCache = new Map();
  let routeCostCacheVersion = 0;

  function invalidateRouteCostCache() {
    routeCostCache.clear();
    routeCostCacheVersion += 1;
  }

  function injectNetworkUi() {
    const routePanel = document.querySelector(".route-panel");
    if (!routePanel || document.querySelector("#networkEditorPanel")) return;
    routePanel.insertAdjacentHTML(
      "afterend",
      `
      <section id="networkEditorPanel" class="network-editor-panel" aria-label="보행 네트워크 편집">
        <h2>보행 네트워크 편집 모드</h2>
        <p class="research-note">첨부 이미지에서 추출한 보행로는 참고용입니다. 실제 경로 계산에는 사용자가 지도 위에서 검토·보정한 보행 네트워크 GeoJSON만 사용됩니다.</p>
        <p id="networkRouteStatus" class="research-note">현재는 보행 네트워크 데이터가 없어 직선거리 기반 예비 경로를 표시합니다.</p>

        <div class="network-toolbar">
          <button id="toggleNetworkEdit" type="button">편집 모드 켜기</button>
          <button data-network-tool="node" type="button">노드 추가</button>
          <button data-network-tool="edge" type="button">엣지 추가</button>
          <button id="deleteNetworkNode" type="button">선택 노드 삭제</button>
          <button id="deleteNetworkEdge" type="button">선택 엣지 삭제</button>
          <button id="autoConnectNetwork" type="button">자동 연결 생성</button>
          <button id="clearNetworkEdges" type="button">엣지 전체 비우기</button>
          <button id="clearNetworkNodes" type="button">노드 전체 비우기</button>
          <button id="validateNetwork" type="button">네트워크 검증</button>
        </div>

        <label class="search-label" for="networkNodeType">노드 유형</label>
        <select id="networkNodeType">
          <option value="entrance">entrance - 주요 진입 후보</option>
          <option value="junction">junction - 교차점</option>
          <option value="facility">facility - 시설 기준점</option>
          <option value="store_anchor">store_anchor - 점포군 연결 기준점</option>
        </select>
        <div class="network-auto-settings">
          <label>자동 연결 최대 거리(m)
            <input id="autoConnectMaxDistance" type="number" min="10" max="120" step="5" value="55" />
          </label>
          <label>노드별 가까운 후보 수
            <input id="autoConnectNearestCount" type="number" min="1" max="6" step="1" value="3" />
          </label>
          <label><input id="autoConnectKeepExisting" type="checkbox" /> 기존 엣지 유지</label>
        </div>


        <div class="network-edge-settings">
          <label>통로 폭
            <select id="edgeWidthLevel">
              <option value="1">1 좁은 골목</option>
              <option value="2" selected>2 보통 보행로</option>
              <option value="3">3 넓은 보행축</option>
            </select>
          </label>
          <label>인지 비용
            <select id="edgeCognitiveCost">
              <option value="1">1 찾기 쉬움</option>
              <option value="2" selected>2 보통</option>
              <option value="3">3 약간 복잡</option>
              <option value="4">4 복잡</option>
              <option value="5">5 매우 복잡</option>
            </select>
          </label>
          <label><input id="edgeIsMainAisle" type="checkbox" /> 주요 보행축</label>
          <label><input id="edgeIsInnerAlley" type="checkbox" /> 내부 골목</label>
        </div>

        <div class="network-toolbar">
          <button id="downloadNetworkNodes" type="button">노드 GeoJSON 다운로드</button>
          <button id="downloadNetworkEdges" type="button">엣지 GeoJSON 다운로드</button>
          <button id="downloadNetworkReport" type="button">검증 보고서 다운로드</button>
        </div>

        <label class="search-label">네트워크 불러오기</label>
        <input id="loadNetworkNodes" type="file" accept=".geojson,.json" />
        <input id="loadNetworkEdges" type="file" accept=".geojson,.json" />

        <div class="network-property-editor">
          <h3>선택 네트워크 항목</h3>
          <label>선택 ID<input id="selectedNetworkId" type="text" readonly /></label>
          <label>이름<input id="editNetworkName" type="text" /></label>
          <label>노드 유형
            <select id="editNodeType">
              <option value="entrance">entrance</option>
              <option value="junction">junction</option>
              <option value="facility">facility</option>
              <option value="store_anchor">store_anchor</option>
            </select>
          </label>
          <label>신뢰도
            <select id="editNetworkConfidence">
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </label>
          <label><input id="editIsEntrance" type="checkbox" /> 입구 후보</label>
          <label><input id="editIsMajor" type="checkbox" /> 주요 기준점</label>
          <label>엣지 통로 폭
            <select id="editEdgeWidthLevel">
              <option value="1">1 좁은 골목</option>
              <option value="2">2 보통 보행로</option>
              <option value="3">3 넓은 보행축</option>
            </select>
          </label>
          <label>엣지 인지 비용
            <select id="editEdgeCognitiveCost">
              <option value="1">1 찾기 쉬움</option>
              <option value="2">2 보통</option>
              <option value="3">3 약간 복잡</option>
              <option value="4">4 복잡</option>
              <option value="5">5 매우 복잡</option>
            </select>
          </label>
          <label><input id="editEdgeIsMainAisle" type="checkbox" /> 주요 보행축</label>
          <label><input id="editEdgeIsInnerAlley" type="checkbox" /> 내부 골목</label>
          <label>메모<textarea id="editNetworkNote" rows="3"></textarea></label>
          <button id="saveNetworkProperties" type="button">선택 항목 저장</button>
        </div>

        <h3>직선거리 / 보행 네트워크 비교</h3>
        <div id="networkComparison" class="route-comparison"></div>
        <h3>네트워크 검증 결과</h3>
        <div id="networkValidation" class="route-comparison"></div>
      </section>
    `
    );
    document.head.insertAdjacentHTML(
      "beforeend",
      `
      <style id="networkEditorStyles">
        .network-editor-panel{border-top:1px solid var(--line);display:grid;gap:10px;margin-top:14px;padding-top:14px}
        .network-editor-panel h2{font-size:15px}.network-editor-panel h3{font-size:13px;margin:4px 0 0}
        .network-toolbar{display:grid;gap:6px;grid-template-columns:repeat(2,1fr)}
        .network-toolbar button{background:#fff;border:1px solid var(--line);border-radius:8px;cursor:pointer;font-size:12px;font-weight:800;min-height:34px}
        .network-toolbar button.active{background:#111827;border-color:#111827;color:#fff}
        .network-edge-settings,.network-auto-settings{display:grid;gap:7px}.network-edge-settings label,.network-auto-settings label{background:var(--surface);border:1px solid var(--line);border-radius:8px;font-size:12px;padding:7px}.network-auto-settings input[type="number"]{border:1px solid var(--line);border-radius:7px;font:inherit;margin-top:4px;padding:7px;width:100%}
        .network-property-editor{background:var(--surface);border:1px solid var(--line);border-radius:8px;display:grid;gap:7px;padding:9px}.network-property-editor label{display:grid;font-size:12px;gap:4px}.network-property-editor input,.network-property-editor select,.network-property-editor textarea{border:1px solid var(--line);border-radius:7px;font:inherit;padding:7px}.network-property-editor button{background:#111827;border:0;border-radius:8px;color:#fff;cursor:pointer;font-size:12px;font-weight:900;min-height:34px}
        .network-node-icon span{align-items:center;border:2px solid #fff;border-radius:999px;box-shadow:0 8px 18px rgba(0,0,0,.25);color:#fff;display:flex;font-size:10px;font-weight:900;height:28px;justify-content:center;width:42px}
        .network-node-icon.selected span{outline:3px solid #facc15}
      </style>
    `
    );
  }

  function nodePrefix(type) {
    if (type === "entrance") return "G";
    if (type === "facility") return "F";
    if (type === "store_anchor") return "A";
    return "N";
  }

  function nextNodeId(type) {
    const prefix = nodePrefix(type);
    const max = network.nodes
      .filter((node) => node.node_id.startsWith(prefix))
      .map((node) => Number(node.node_id.slice(prefix.length)) || 0)
      .reduce((a, b) => Math.max(a, b), 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  }

  function nextEdgeId() {
    const max = network.edges
      .map((edge) => Number(edge.edge_id.replace(/^E/, "")) || 0)
      .reduce((a, b) => Math.max(a, b), 0);
    return `E${String(max + 1).padStart(3, "0")}`;
  }

  function initNetworkLayers() {
    if (!map || network.nodeLayer) return;
    network.edgeLayer = L.layerGroup().addTo(map);
    network.nodeLayer = L.layerGroup().addTo(map);
  }

  function boolValue(value) {
    return value === true || value === 1 || value === "1" || value === "true";
  }

  function parseNodeFeature(feature) {
    const [lon, lat] = feature.geometry.coordinates;
    return {
      node_id: feature.properties.node_id,
      node_type: feature.properties.node_type || "junction",
      name: feature.properties.name || feature.properties.node_id,
      is_entrance: boolValue(feature.properties.is_entrance),
      is_major: boolValue(feature.properties.is_major),
      note: feature.properties.note || feature.properties.description || "",
      source: feature.properties.source || "image_based_estimate",
      confidence: feature.properties.confidence || "medium",
      lat,
      lon,
    };
  }

  function parseEdgeFeature(feature) {
    return {
      edge_id: feature.properties.edge_id,
      from_node: feature.properties.from_node,
      to_node: feature.properties.to_node,
      length_m: Number(feature.properties.length_m) || lineLength(feature.geometry.coordinates),
      width_level: Number(feature.properties.width_level) || 2,
      is_main_aisle: Number(feature.properties.is_main_aisle || 0),
      is_inner_alley: Number(feature.properties.is_inner_alley || 0),
      cognitive_cost: Number(feature.properties.cognitive_cost) || 2,
      note: feature.properties.note || "",
      source: feature.properties.source || "image_based_estimate",
      confidence: feature.properties.confidence || "medium",
      coordinates: feature.geometry.coordinates,
    };
  }

  function lineLength(coordinates) {
    let total = 0;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
      total += haversineM(
        { lat: coordinates[index][1], lon: coordinates[index][0] },
        { lat: coordinates[index + 1][1], lon: coordinates[index + 1][0] }
      );
    }
    return Math.round(total);
  }

  async function loadExistingNetwork() {
    try {
      const [nodesGeojson, edgesGeojson] = await Promise.all([
        fetch("./data/network_nodes.geojson", { cache: "no-store" }).then((response) => response.json()),
        fetch("./data/network_edges.geojson", { cache: "no-store" }).then((response) => response.json()),
      ]);
      network.nodes = (nodesGeojson.features || []).map(parseNodeFeature).filter((node) => node.node_id);
      network.edges = (edgesGeojson.features || []).map(parseEdgeFeature).filter((edge) => edge.edge_id);
      renderNetwork();
      updateNetworkStatus();
      if (network.nodes.length && network.edges.length) renderRecommendations();
    } catch (error) {
      updateNetworkStatus("네트워크 파일을 불러오지 못했습니다. 편집 모드에서 새로 만들 수 있습니다.");
    }
  }

  function networkNodeColor(type) {
    if (type === "entrance") return "#0f766e";
    if (type === "facility") return "#2563eb";
    if (type === "store_anchor") return "#7c3aed";
    return "#111827";
  }

  function renderNetwork() {
    invalidateRouteCostCache();
    initNetworkLayers();
    if (!network.nodeLayer) return;
    network.edgeLayer.clearLayers();
    network.nodeLayer.clearLayers();
    network.edges.forEach((edge) => {
      const line = L.polyline(
        edge.coordinates.map((coordinate) => [coordinate[1], coordinate[0]]),
        {
          color: network.selectedEdgeId === edge.edge_id ? "#dc2626" : edge.is_main_aisle ? "#2563eb" : "#7c3aed",
          weight: network.selectedEdgeId === edge.edge_id ? 6 : edge.width_level + 2,
          opacity: 0.78,
          dashArray: edge.is_inner_alley ? "6 6" : null,
        }
      )
        .bindPopup(`${edge.edge_id}: ${edge.from_node} → ${edge.to_node}<br />${formatNumber(edge.length_m)}m`)
        .addTo(network.edgeLayer);
      line.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        network.selectedEdgeId = edge.edge_id;
        network.selectedNodeId = null;
        renderNetwork();
        updateSelectionEditor();
      });
    });
    network.nodes.forEach((node) => {
      const icon = L.divIcon({
        className: `network-node-icon ${network.selectedNodeId === node.node_id ? "selected" : ""}`,
        html: `<span style="background:${networkNodeColor(node.node_type)}">${node.node_id}</span>`,
        iconSize: [44, 30],
        iconAnchor: [22, 15],
      });
      const marker = L.marker([node.lat, node.lon], { icon, draggable: network.editMode, autoPan: true })
        .bindPopup(`${node.node_id} / ${node.node_type}<br />${escapeHtml(node.name)}<br />${escapeHtml(node.note)}`)
        .addTo(network.nodeLayer);
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        handleNetworkNodeClick(node);
      });
      marker.on("dragend", (event) => {
        const latlng = event.target.getLatLng();
        node.lat = latlng.lat;
        node.lon = latlng.lng;
        refreshEdgesForNode(node.node_id);
        renderNetwork();
        updateNetworkStatus();
      });
    });
  }

  function handleNetworkNodeClick(node) {
    if (network.editMode && network.tool === "edge") {
      if (!network.pendingEdgeNodeId) {
        network.pendingEdgeNodeId = node.node_id;
        network.selectedNodeId = node.node_id;
      } else if (network.pendingEdgeNodeId !== node.node_id) {
        createEdge(network.pendingEdgeNodeId, node.node_id);
        network.pendingEdgeNodeId = null;
      }
    } else {
      network.selectedNodeId = node.node_id;
      network.selectedEdgeId = null;
    }
    renderNetwork();
    updateSelectionEditor();
  }

  function refreshEdgesForNode(nodeId) {
    network.edges.forEach((edge) => {
      if (edge.from_node !== nodeId && edge.to_node !== nodeId) return;
      const from = network.nodes.find((node) => node.node_id === edge.from_node);
      const to = network.nodes.find((node) => node.node_id === edge.to_node);
      if (!from || !to) return;
      edge.coordinates = [[from.lon, from.lat], [to.lon, to.lat]];
      edge.length_m = Math.round(haversineM(from, to));
    });
  }

  function updateSelectionEditor() {
    const idInput = document.querySelector("#selectedNetworkId");
    if (!idInput) return;
    const node = network.nodes.find((item) => item.node_id === network.selectedNodeId);
    const edge = network.edges.find((item) => item.edge_id === network.selectedEdgeId);
    const selected = node || edge;
    idInput.value = selected ? (node ? node.node_id : edge.edge_id) : "";
    document.querySelector("#editNetworkName").value = node ? node.name : "";
    document.querySelector("#editNodeType").value = node ? node.node_type : "junction";
    document.querySelector("#editNetworkConfidence").value = selected?.confidence || "medium";
    document.querySelector("#editIsEntrance").checked = node ? node.is_entrance : false;
    document.querySelector("#editIsMajor").checked = node ? node.is_major : false;
    document.querySelector("#editEdgeWidthLevel").value = edge ? String(edge.width_level) : "2";
    document.querySelector("#editEdgeCognitiveCost").value = edge ? String(edge.cognitive_cost) : "2";
    document.querySelector("#editEdgeIsMainAisle").checked = edge ? Boolean(edge.is_main_aisle) : false;
    document.querySelector("#editEdgeIsInnerAlley").checked = edge ? Boolean(edge.is_inner_alley) : false;
    document.querySelector("#editNetworkNote").value = selected?.note || "";
  }

  function saveSelectedProperties() {
    const node = network.nodes.find((item) => item.node_id === network.selectedNodeId);
    const edge = network.edges.find((item) => item.edge_id === network.selectedEdgeId);
    const note = document.querySelector("#editNetworkNote").value;
    const confidence = document.querySelector("#editNetworkConfidence").value;
    if (node) {
      node.name = document.querySelector("#editNetworkName").value || node.node_id;
      node.node_type = document.querySelector("#editNodeType").value;
      node.is_entrance = document.querySelector("#editIsEntrance").checked;
      node.is_major = document.querySelector("#editIsMajor").checked;
      node.note = note;
      node.confidence = confidence;
      node.source = node.source || "image_based_estimate";
    }
    if (edge) {
      edge.width_level = Number(document.querySelector("#editEdgeWidthLevel").value);
      edge.cognitive_cost = Number(document.querySelector("#editEdgeCognitiveCost").value);
      edge.is_main_aisle = document.querySelector("#editEdgeIsMainAisle").checked ? 1 : 0;
      edge.is_inner_alley = document.querySelector("#editEdgeIsInnerAlley").checked ? 1 : 0;
      edge.note = note;
      edge.confidence = confidence;
      edge.source = edge.source || "image_based_estimate";
    }
    renderNetwork();
    updateNetworkStatus();
    validateNetwork();
  }

  function addNode(latlng) {
    const type = document.querySelector("#networkNodeType").value;
    const nodeId = nextNodeId(type);
    network.nodes.push({
      node_id: nodeId,
      node_type: type,
      name: type === "entrance" ? `${nodeId} 주요 진입 후보` : nodeId,
      is_entrance: type === "entrance",
      is_major: type === "entrance",
      note: "Leaflet edit mode image-based estimate node",
      source: "image_based_estimate",
      confidence: "medium",
      lat: latlng.lat,
      lon: latlng.lng,
    });
    renderNetwork();
    updateNetworkStatus();
    updateSelectionEditor();
  }

  function createEdge(fromNodeId, toNodeId) {
    const edge = edgeObject(fromNodeId, toNodeId, {
      note: "Manually connected in Leaflet edit mode from user placed nodes.",
      source: "user_manual_connect",
      confidence: "high",
    });
    if (!edge) return;
    const key = edgeKey(fromNodeId, toNodeId);
    const exists = network.edges.some((item) => edgeKey(item.from_node, item.to_node) === key);
    if (exists) return;
    network.edges.push(edge);
    network.selectedEdgeId = edge.edge_id;
    renderNetwork();
    updateNetworkStatus();
    updateSelectionEditor();
  }

  function edgeKey(fromNodeId, toNodeId) {
    return [fromNodeId, toNodeId].sort().join("--");
  }

  function edgeObject(fromNodeId, toNodeId, options = {}) {
    const from = network.nodes.find((node) => node.node_id === fromNodeId);
    const to = network.nodes.find((node) => node.node_id === toNodeId);
    if (!from || !to) return null;
    const widthLevel = options.width_level ?? Number(document.querySelector("#edgeWidthLevel")?.value || 2);
    const isMainAisle = options.is_main_aisle ?? (document.querySelector("#edgeIsMainAisle")?.checked ? 1 : 0);
    const isInnerAlley = options.is_inner_alley ?? (document.querySelector("#edgeIsInnerAlley")?.checked ? 1 : 0);
    const cognitiveCost = options.cognitive_cost ?? Number(document.querySelector("#edgeCognitiveCost")?.value || 2);
    return {
      edge_id: nextEdgeId(),
      from_node: fromNodeId,
      to_node: toNodeId,
      length_m: Math.round(haversineM(from, to)),
      width_level: widthLevel,
      is_main_aisle: isMainAisle,
      is_inner_alley: isInnerAlley,
      cognitive_cost: cognitiveCost,
      note: options.note || "Auto-connected from user placed nodes; review on map before final use.",
      source: options.source || "user_points_auto_connect",
      confidence: options.confidence || "medium",
      coordinates: [[from.lon, from.lat], [to.lon, to.lat]],
    };
  }

  function orientation(a, b, c) {
    const value = (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon);
    if (Math.abs(value) < 1e-12) return 0;
    return value > 0 ? 1 : -1;
  }

  function segmentsCross(a, b, c, d) {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
  }

  function wouldCrossExisting(candidate) {
    const a = network.nodes.find((node) => node.node_id === candidate.from_node);
    const b = network.nodes.find((node) => node.node_id === candidate.to_node);
    if (!a || !b) return false;
    return network.edges.some((edge) => {
      if ([edge.from_node, edge.to_node].includes(candidate.from_node) || [edge.from_node, edge.to_node].includes(candidate.to_node)) return false;
      const c = network.nodes.find((node) => node.node_id === edge.from_node);
      const d = network.nodes.find((node) => node.node_id === edge.to_node);
      return c && d && segmentsCross(a, b, c, d);
    });
  }

  function autoConnectNetwork() {
    if (network.nodes.length < 2) {
      updateNetworkStatus("Auto connect needs at least 2 nodes.");
      return;
    }
    const maxDistance = Number(document.querySelector("#autoConnectMaxDistance")?.value || 55);
    const nearestCount = Number(document.querySelector("#autoConnectNearestCount")?.value || 3);
    const keepExisting = document.querySelector("#autoConnectKeepExisting")?.checked;
    if (!keepExisting) network.edges = [];

    const existingKeys = new Set(network.edges.map((edge) => edgeKey(edge.from_node, edge.to_node)));
    const candidates = [];
    network.nodes.forEach((node) => {
      const nearest = network.nodes
        .filter((other) => other.node_id !== node.node_id)
        .map((other) => ({ from: node, to: other, distance: haversineM(node, other) }))
        .filter((item) => item.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, nearestCount);
      nearest.forEach((item) => {
        const key = edgeKey(item.from.node_id, item.to.node_id);
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          candidates.push(item);
        }
      });
    });

    candidates.sort((a, b) => a.distance - b.distance);
    let added = 0;
    let skippedCrossing = 0;
    candidates.forEach((candidate) => {
      const edge = edgeObject(candidate.from.node_id, candidate.to.node_id, {
        width_level: candidate.distance <= 35 ? 2 : 1,
        is_main_aisle: candidate.distance <= 45 ? 1 : 0,
        is_inner_alley: candidate.distance > 45 ? 1 : 0,
        cognitive_cost: candidate.distance > 45 ? 3 : 2,
        note: "Auto-connected user node pair within " + Math.round(candidate.distance) + "m; verify this edge follows a visible aisle.",
        source: "user_points_auto_connect",
        confidence: "medium",
      });
      if (!edge) return;
      if (wouldCrossExisting(edge)) {
        skippedCrossing += 1;
        return;
      }
      network.edges.push(edge);
      added += 1;
    });
    network.selectedEdgeId = null;
    renderNetwork();
    updateNetworkStatus("Auto connect: added " + formatNumber(added) + " edges, skipped " + formatNumber(skippedCrossing) + " crossing candidates. Delete any wrong edge manually.");
    validateNetwork();
    renderRecommendations();
  }

  function clearNetworkEdges() {
    network.edges = [];
    network.selectedEdgeId = null;
    renderNetwork();
    updateNetworkStatus("All edges cleared. Place nodes on the map, then run auto connect again.");
    validateNetwork();
  }

  function clearNetworkNodes() {
    network.nodes = [];
    network.edges = [];
    network.selectedNodeId = null;
    network.selectedEdgeId = null;
    network.pendingEdgeNodeId = null;
    renderNetwork();
    updateNetworkStatus("All nodes and edges cleared. Turn on edit mode, choose node add, and click actual road junctions.");
    validateNetwork();
  }

  function deleteSelectedNode() {
    if (!network.selectedNodeId) return;
    network.nodes = network.nodes.filter((node) => node.node_id !== network.selectedNodeId);
    network.edges = network.edges.filter(
      (edge) => edge.from_node !== network.selectedNodeId && edge.to_node !== network.selectedNodeId
    );
    network.selectedNodeId = null;
    renderNetwork();
    updateNetworkStatus();
  }

  function deleteSelectedEdge() {
    if (!network.selectedEdgeId) return;
    network.edges = network.edges.filter((edge) => edge.edge_id !== network.selectedEdgeId);
    network.selectedEdgeId = null;
    renderNetwork();
    updateNetworkStatus();
  }

  function nodesGeojson() {
    return {
      type: "FeatureCollection",
      name: "network_nodes",
      features: network.nodes.map((node) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [node.lon, node.lat] },
        properties: {
          node_id: node.node_id,
          node_type: node.node_type,
          name: node.name,
          is_entrance: node.is_entrance ? 1 : 0,
          is_major: node.is_major ? 1 : 0,
          note: node.note,
          source: node.source || "image_based_estimate",
          confidence: node.confidence || "medium",
        },
      })),
    };
  }

  function edgesGeojson() {
    return {
      type: "FeatureCollection",
      name: "network_edges",
      features: network.edges.map((edge) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: edge.coordinates },
        properties: {
          edge_id: edge.edge_id,
          from_node: edge.from_node,
          to_node: edge.to_node,
          length_m: edge.length_m,
          width_level: edge.width_level,
          is_main_aisle: edge.is_main_aisle,
          is_inner_alley: edge.is_inner_alley,
          cognitive_cost: edge.cognitive_cost,
          note: edge.note,
          source: edge.source || "image_based_estimate",
          confidence: edge.confidence || "medium",
        },
      })),
    };
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/geo+json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function readFileAsJson(input, callback) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => callback(JSON.parse(reader.result));
    reader.readAsText(file, "utf-8");
  }

  function graphCost(edge, routeType) {
    if (routeType === "초행자 친화형") return edge.length_m + edge.cognitive_cost * 22;
    if (routeType === "넓은 길 우선형") {
      const narrowPenalty = edge.width_level === 1 ? 55 : edge.width_level === 2 ? 18 : 0;
      const mainBonus = edge.is_main_aisle ? -10 : 0;
      return edge.length_m + narrowPenalty + mainBonus;
    }
    if (routeType === "상생형") return Math.max(edge.length_m * 0.55, edge.length_m - edge.is_inner_alley * 18);
    return edge.length_m;
  }

  function buildGraph(routeType) {
    const graph = new Map();
    network.nodes.forEach((node) => graph.set(node.node_id, []));
    network.edges.forEach((edge) => {
      if (!graph.has(edge.from_node) || !graph.has(edge.to_node)) return;
      const cost = graphCost(edge, routeType);
      graph.get(edge.from_node).push({ node: edge.to_node, edge, cost });
      graph.get(edge.to_node).push({ node: edge.from_node, edge, cost });
    });
    return graph;
  }

  function nearestNode(point) {
    if (!network.nodes.length) return null;
    return [...network.nodes].sort((a, b) => haversineM(point, a) - haversineM(point, b))[0];
  }

  function dijkstra(startId, endId, routeType) {
    const graph = buildGraph(routeType);
    if (!graph.has(startId) || !graph.has(endId)) return null;
    const distances = new Map([[startId, 0]]);
    const previous = new Map();
    const visited = new Set();
    while (visited.size < graph.size) {
      let current = null;
      let best = Infinity;
      graph.forEach((_edges, nodeId) => {
        const value = distances.get(nodeId) ?? Infinity;
        if (!visited.has(nodeId) && value < best) {
          best = value;
          current = nodeId;
        }
      });
      if (!current || current === endId) break;
      visited.add(current);
      graph.get(current).forEach((next) => {
        const candidate = (distances.get(current) ?? Infinity) + next.cost;
        if (candidate < (distances.get(next.node) ?? Infinity)) {
          distances.set(next.node, candidate);
          previous.set(next.node, { node: current, edge: next.edge });
        }
      });
    }
    if (!distances.has(endId)) return null;
    const nodeIds = [endId];
    const edges = [];
    let cursor = endId;
    while (cursor !== startId) {
      const prev = previous.get(cursor);
      if (!prev) return null;
      edges.push(prev.edge);
      cursor = prev.node;
      nodeIds.unshift(cursor);
    }
    edges.reverse();
    return { nodeIds, edges, cost: distances.get(endId) };
  }

  function appendCoordinate(coordinates, lon, lat) {
    const last = coordinates[coordinates.length - 1];
    if (last && Math.abs(last[0] - lon) < 1e-12 && Math.abs(last[1] - lat) < 1e-12) return;
    coordinates.push([lon, lat]);
  }

  function nearestNodeForStore(store) {
    return nearestNode(featurePoint(store));
  }

  function networkLegCost(fromNodeId, toNodeId, routeType) {
    if (fromNodeId === toNodeId) return 0;
    const pair = [fromNodeId, toNodeId].sort().join("|");
    const key = `${routeCostCacheVersion}|${routeType}|${pair}`;
    if (routeCostCache.has(key)) return routeCostCache.get(key);
    const path = dijkstra(fromNodeId, toNodeId, routeType);
    const cost = path ? path.cost : Infinity;
    routeCostCache.set(key, cost);
    return cost;
  }

  function storeOrderCost(stores, startPoint, routeType) {
    const startNode = nearestNode(startPoint);
    if (!startNode) return Infinity;
    let currentNodeId = startNode.node_id;
    let total = Math.round(haversineM(startPoint, startNode));
    stores.forEach((store) => {
      const targetNode = nearestNodeForStore(store);
      if (!targetNode) {
        total = Infinity;
        return;
      }
      total += networkLegCost(currentNodeId, targetNode.node_id, routeType);
      total += Math.round(haversineM(targetNode, featurePoint(store))) * 0.35;
      currentNodeId = targetNode.node_id;
    });
    return total;
  }

  function routeCategoryKey(store) {
    return store?.properties?.shopping_category || "";
  }

  function storeIdentity(store) {
    return store?.properties?.id || store?.properties?.name || JSON.stringify(store?.geometry?.coordinates || []);
  }

  function categoriesFromRoute(stores) {
    const seen = new Set();
    return stores.map(routeCategoryKey).filter((category) => {
      if (!category || seen.has(category)) return false;
      seen.add(category);
      return true;
    });
  }

  function networkCandidatePool(category, originalStore, routeType) {
    let pool = [];
    if (typeof candidatePool === "function") {
      try {
        pool = candidatePool(category, { includeOuter: true });
      } catch (_error) {
        pool = [];
      }
    }
    if (!pool.length) pool = originalStore ? [originalStore] : [];
    const limit = routeType === "상생형" ? 10 : 8;
    const byId = new Map();
    pool.slice(0, limit).forEach((store) => byId.set(storeIdentity(store), store));
    if (originalStore) byId.set(storeIdentity(originalStore), originalStore);
    return [...byId.values()].filter((store) => nearestNodeForStore(store));
  }

  function policyAdjustment(store, routeType, selectedStores = []) {
    const props = store.properties || {};
    let score = 0;
    const duplicateCount = Number(props.coordinate_duplicate_count || 0);
    score += Math.min(duplicateCount, 30) * 1.2;

    if (selectedStores.some((selected) => selected.geometry?.coordinates?.join(",") === store.geometry?.coordinates?.join(","))) score += 120;
    if (selectedStores.some((selected) => selected.properties?.roadAddress && selected.properties.roadAddress === props.roadAddress)) score += 28;

    if (routeType === "초행자 친화형") {
      score += props.distance_zone === "중심부" ? -45 : props.distance_zone === "중간부" ? -12 : 55;
      if (props.directMarketMatch) score -= 55;
    } else if (routeType === "상생형") {
      score += props.distance_zone === "외곽부" ? -42 : props.distance_zone === "중간부" ? -18 : 14;
      if (props.directMarketMatch) score -= 4;
    } else if (routeType === "넓은 길 우선형") {
      score += props.distance_zone === "외곽부" ? 12 : 0;
      if (props.directMarketMatch) score -= 12;
    } else {
      score += Number(props.distanceM || 0) * 0.04;
      if (props.directMarketMatch) score -= 10;
    }
    return score;
  }

  function routePolicyAdjustment(stores, routeType) {
    return stores.reduce((total, store, index) => total + policyAdjustment(store, routeType, stores.slice(0, index)), 0);
  }

  function networkRouteObjective(stores, startPoint, routeType) {
    return storeOrderCost(optimizeStoreOrderByNetwork(stores, startPoint, routeType), startPoint, routeType) + routePolicyAdjustment(stores, routeType);
  }

  function optimizeRouteCandidatesByNetwork(stores, startPoint, routeType) {
    if (!network.nodes.length || !network.edges.length || !stores.length || typeof candidatePool !== "function") return stores;
    const categories = categoriesFromRoute(stores);
    if (categories.length !== stores.length) return stores;
    const originalByCategory = new Map(stores.map((store) => [routeCategoryKey(store), store]));
    const pools = new Map(categories.map((category) => [category, networkCandidatePool(category, originalByCategory.get(category), routeType)]));
    if ([...pools.values()].some((pool) => !pool.length)) return stores;

    const remaining = [...categories];
    const selected = [];
    let currentNode = nearestNode(startPoint);
    if (!currentNode) return stores;

    while (remaining.length) {
      let best = null;
      remaining.forEach((category) => {
        pools.get(category).forEach((store) => {
          const targetNode = nearestNodeForStore(store);
          const leg = networkLegCost(currentNode.node_id, targetNode.node_id, routeType);
          const connector = Math.round(haversineM(targetNode, featurePoint(store))) * 0.35;
          const score = leg + connector + policyAdjustment(store, routeType, selected);
          if (!best || score < best.score) best = { category, store, targetNode, score };
        });
      });
      if (!best) return stores;
      selected.push(best.store);
      remaining.splice(remaining.indexOf(best.category), 1);
      currentNode = best.targetNode;
    }

    return selected;
  }

  function optimizeStoreOrderByNetwork(stores, startPoint, routeType) {
    if (!network.nodes.length || !network.edges.length || stores.length <= 2) return stores;
    const remaining = stores.map((store) => ({ store, targetNode: nearestNodeForStore(store) })).filter((item) => item.targetNode);
    if (remaining.length !== stores.length) return stores;

    const ordered = [];
    let currentNode = nearestNode(startPoint);
    if (!currentNode) return stores;

    while (remaining.length) {
      let bestIndex = 0;
      let bestScore = Infinity;
      remaining.forEach((item, index) => {
        const leg = networkLegCost(currentNode.node_id, item.targetNode.node_id, routeType);
        const connector = Math.round(haversineM(item.targetNode, featurePoint(item.store))) * 0.35;
        const duplicateBonus = ordered.some((store) => nearestNodeForStore(store)?.node_id === item.targetNode.node_id) ? -12 : 0;
        const score = leg + connector + duplicateBonus;
        if (score < bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
      const [chosen] = remaining.splice(bestIndex, 1);
      ordered.push(chosen.store);
      currentNode = chosen.targetNode;
    }

    let improved = true;
    let bestOrder = ordered;
    let bestCost = storeOrderCost(bestOrder, startPoint, routeType);
    while (improved) {
      improved = false;
      for (let i = 0; i < bestOrder.length - 2; i += 1) {
        for (let j = i + 2; j < bestOrder.length; j += 1) {
          const trial = bestOrder.slice(0, i + 1).concat(bestOrder.slice(i + 1, j + 1).reverse(), bestOrder.slice(j + 1));
          const cost = storeOrderCost(trial, startPoint, routeType);
          if (cost + 0.1 < bestCost) {
            bestOrder = trial;
            bestCost = cost;
            improved = true;
          }
        }
      }
    }
    return bestOrder;
  }

  function buildNetworkRouteForStores(stores, startPoint, routeType) {
    if (!network.nodes.length || !network.edges.length) return null;
    const startNode = nearestNode(startPoint);
    if (!startNode) return null;
    let currentNode = startNode;
    const coordinates = [];
    appendCoordinate(coordinates, startPoint.lon, startPoint.lat);
    appendCoordinate(coordinates, startNode.lon, startNode.lat);
    const segmentNodeIds = [startNode.node_id];
    const usedEdges = [];
    const stopConnectors = [];
    let totalDistance = Math.round(haversineM(startPoint, startNode));

    for (const store of stores) {
      const storePoint = featurePoint(store);
      const targetNode = nearestNode(storePoint);
      if (!targetNode) return null;
      const path = dijkstra(currentNode.node_id, targetNode.node_id, routeType);
      if (!path) return null;
      path.nodeIds.slice(1).forEach((nodeId) => {
        const node = network.nodes.find((item) => item.node_id === nodeId);
        appendCoordinate(coordinates, node.lon, node.lat);
        segmentNodeIds.push(nodeId);
      });
      path.edges.forEach((edge) => {
        totalDistance += edge.length_m;
        usedEdges.push(edge);
      });
      const connectorDistance = Math.round(haversineM(targetNode, storePoint));
      totalDistance += connectorDistance;
      stopConnectors.push({ store, node: targetNode, distance: connectorDistance });
      currentNode = targetNode;
    }
    return {
      coordinates,
      totalDistance,
      nodeCount: new Set(segmentNodeIds).size,
      edgeCount: usedEdges.length,
      turnCount: estimateTurns(coordinates),
      usedEdges,
      stopConnectors,
      optimizedOrder: true,
    };
  }

  function estimateTurns(coordinates) {
    let turns = 0;
    for (let index = 1; index < coordinates.length - 1; index += 1) {
      const a = { lon: coordinates[index - 1][0], lat: coordinates[index - 1][1] };
      const b = { lon: coordinates[index][0], lat: coordinates[index][1] };
      const c = { lon: coordinates[index + 1][0], lat: coordinates[index + 1][1] };
      const diff = Math.abs(bearingDeg(a, b) - bearingDeg(b, c));
      const angle = Math.min(diff, 360 - diff);
      if (angle > 35) turns += 1;
    }
    return turns;
  }

  function networkIsUsable() {
    return network.nodes.length > 1 && network.edges.length > 0;
  }

  window.buildNetworkRouteForStores = buildNetworkRouteForStores;

  renderActiveRoute = function renderActiveRouteWithNetwork(result) {
    const networkSelectedRoute = optimizeRouteCandidatesByNetwork(result.route, result.startPoint, state.routeType);
    const optimizedRoute = optimizeStoreOrderByNetwork(networkSelectedRoute, result.startPoint, state.routeType);
    const optimizedResult = { ...result, route: optimizedRoute };
    const path = buildNetworkRouteForStores(optimizedRoute, result.startPoint, state.routeType);
    if (!path) {
      originalRenderActiveRoute(result);
      updateNetworkStatus();
      renderNetworkComparison(result, null);
      return;
    }
    const config = ROUTE_CONFIG[state.routeType];
    if (routeLayer) {
      routeLayer.clearLayers();
      const latLngs = path.coordinates.map((coordinate) => [coordinate[1], coordinate[0]]);
      L.polyline(latLngs, { pane: "routePane", color: "#ffffff", weight: 18, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(routeLayer);
      L.polyline(latLngs, { pane: "routePane", color: config.color, weight: 9, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(routeLayer);
      renderStartMarker(result.startPoint, config.color);
      renderDirectionArrows(path.coordinates.map((coordinate) => ({ lon: coordinate[0], lat: coordinate[1] })), config.color);
      path.stopConnectors.forEach((connector) => {
        const storePoint = featurePoint(connector.store);
        L.polyline(
          [[connector.node.lat, connector.node.lon], [storePoint.lat, storePoint.lon]],
          { pane: "routePane", color: config.color, weight: 2, opacity: 0.55, dashArray: "4 5" }
        ).addTo(routeLayer);
      });
      optimizedResult.route.forEach((store, index) => {
        const point = featurePoint(store);
        const icon = L.divIcon({
          className: "route-number-icon",
          html: `<span style="background:${config.color}">${index + 1}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        L.marker([point.lat, point.lon], { icon, pane: "routePane", zIndexOffset: 1300 })
          .bindPopup(popupHtml(store.properties))
          .addTo(routeLayer);
      });
    }
    const minutes = Math.round((path.totalDistance / WALKING_M_PER_MIN) * 10) / 10;
    dom.routeResults.innerHTML = `
      <div class="route-summary">
        <h3>${escapeHtml(state.routeType)} 보행 네트워크 경로</h3>
        <p>현재 경로: 네트워크 비용 기반으로 방문 순서를 다시 정렬한 뒤, 사용자가 검토·보정한 노드와 엣지를 따라 구간별 Dijkstra 경로를 계산했습니다. 굵은 선은 실제 보행 네트워크 본선이고, 점선은 점포 접근 보조선입니다.</p>
        <div class="route-metrics">
          <span>출발지: ${escapeHtml(result.startPoint.label)}</span>
          <span>방문 ${formatNumber(optimizedResult.route.length)}곳</span>
          <span>네트워크 ${formatNumber(path.totalDistance)}m</span>
          <span>약 ${minutes}분</span>
          <span>경유 노드 ${formatNumber(path.nodeCount)}개</span>
          <span>방향 전환 ${formatNumber(path.turnCount)}회</span>
        </div>
        <ol>
          ${optimizedResult.route
            .map((store) => `<li>${escapeHtml(store.properties.shopping_category)} - ${escapeHtml(store.properties.name)}</li>`)
            .join("")}
        </ol>
      </div>
    `;
    updateNetworkStatus("현재 경로: 보행 네트워크 기반 경로");
    renderNetworkComparison(optimizedResult, path);
  };

  function validateNetwork() {
    const nodeIds = new Set(network.nodes.map((node) => node.node_id));
    const missingFrom = network.edges.filter((edge) => !nodeIds.has(edge.from_node));
    const missingTo = network.edges.filter((edge) => !nodeIds.has(edge.to_node));
    const missingLength = network.edges.filter((edge) => !edge.length_m);
    const degree = new Map(network.nodes.map((node) => [node.node_id, 0]));
    network.edges.forEach((edge) => {
      if (degree.has(edge.from_node)) degree.set(edge.from_node, degree.get(edge.from_node) + 1);
      if (degree.has(edge.to_node)) degree.set(edge.to_node, degree.get(edge.to_node) + 1);
    });
    const isolated = [...degree.entries()].filter(([, value]) => value === 0).map(([key]) => key);
    const components = connectedComponents();
    const report = {
      nodeCount: network.nodes.length,
      edgeCount: network.edges.length,
      entranceCount: network.nodes.filter((node) => node.node_type === "entrance" || node.is_entrance).length,
      junctionCount: network.nodes.filter((node) => node.node_type === "junction").length,
      facilityCount: network.nodes.filter((node) => node.node_type === "facility").length,
      storeAnchorCount: network.nodes.filter((node) => node.node_type === "store_anchor").length,
      missingFromCount: missingFrom.length,
      missingToCount: missingTo.length,
      missingLengthCount: missingLength.length,
      isolatedNodeCount: isolated.length,
      componentCount: components.length,
      largestComponentSize: components[0]?.length || 0,
      isolatedNodes: isolated,
    };
    network.validation = report;
    renderValidation(report);
    return report;
  }

  function connectedComponents() {
    const adjacency = new Map(network.nodes.map((node) => [node.node_id, []]));
    network.edges.forEach((edge) => {
      if (adjacency.has(edge.from_node) && adjacency.has(edge.to_node)) {
        adjacency.get(edge.from_node).push(edge.to_node);
        adjacency.get(edge.to_node).push(edge.from_node);
      }
    });
    const visited = new Set();
    const components = [];
    network.nodes.forEach((node) => {
      if (visited.has(node.node_id)) return;
      const stack = [node.node_id];
      const component = [];
      visited.add(node.node_id);
      while (stack.length) {
        const current = stack.pop();
        component.push(current);
        adjacency.get(current).forEach((next) => {
          if (!visited.has(next)) {
            visited.add(next);
            stack.push(next);
          }
        });
      }
      components.push(component);
    });
    return components.sort((a, b) => b.length - a.length);
  }

  function validationMarkdown(report = network.validation || validateNetwork()) {
    return `# 보행 네트워크 검증 보고서

- 전체 노드 수: ${report.nodeCount}
- 전체 엣지 수: ${report.edgeCount}
- entrance 후보 수: ${report.entranceCount}
- junction 수: ${report.junctionCount}
- facility 수: ${report.facilityCount}
- from_node가 존재하지 않는 edge 수: ${report.missingFromCount}
- to_node가 존재하지 않는 edge 수: ${report.missingToCount}
- length_m 누락 edge 수: ${report.missingLengthCount}
- 고립 노드 수: ${report.isolatedNodeCount}
- 연결 컴포넌트 수: ${report.componentCount}
- 가장 큰 컴포넌트의 노드 수: ${report.largestComponentSize}

현재 검증은 사용자가 Leaflet 지도에서 편집한 보행 네트워크 초안에 대한 구조 검증이다. 실제 현장 보행 가능 여부는 QGIS 또는 현장조사로 보정해야 한다.
`;
  }

  function renderValidation(report) {
    const target = document.querySelector("#networkValidation");
    if (!target) return;
    target.innerHTML = `
      <table>
        <tbody>
          <tr><th>노드</th><td>${formatNumber(report.nodeCount)}</td><th>엣지</th><td>${formatNumber(report.edgeCount)}</td></tr>
          <tr><th>입구 후보</th><td>${formatNumber(report.entranceCount)}</td><th>교차점</th><td>${formatNumber(report.junctionCount)}</td></tr>
          <tr><th>누락 from/to</th><td>${formatNumber(report.missingFromCount)} / ${formatNumber(report.missingToCount)}</td><th>길이 누락</th><td>${formatNumber(report.missingLengthCount)}</td></tr>
          <tr><th>고립 노드</th><td>${formatNumber(report.isolatedNodeCount)}</td><th>컴포넌트</th><td>${formatNumber(report.componentCount)}</td></tr>
          <tr><th>최대 컴포넌트</th><td colspan="3">${formatNumber(report.largestComponentSize)}개 노드</td></tr>
        </tbody>
      </table>
    `;
  }

  function renderNetworkComparison(result, networkPath) {
    const target = document.querySelector("#networkComparison");
    if (!target) return;
    const straight = result.metrics.distance;
    if (!networkPath) {
      target.innerHTML = `<p class="research-note">현재는 보행 네트워크 데이터가 없어 직선거리 기반 예비 경로를 표시합니다.</p>`;
      return;
    }
    const increase = straight ? Math.round(((networkPath.totalDistance - straight) / straight) * 1000) / 10 : 0;
    target.innerHTML = `
      <table>
        <tbody>
          <tr><th>직선거리 총 거리</th><td>${formatNumber(straight)}m</td></tr>
          <tr><th>보행 네트워크 총 거리</th><td>${formatNumber(networkPath.totalDistance)}m</td></tr>
          <tr><th>거리 증가율</th><td>${increase}%</td></tr>
          <tr><th>방향 전환 수</th><td>${formatNumber(networkPath.turnCount)}회</td></tr>
          <tr><th>경유 노드 수</th><td>${formatNumber(networkPath.nodeCount)}개</td></tr>
          <tr><th>방문 점포 수</th><td>${formatNumber(result.route.length)}개</td></tr>
          <tr><th>예상 이동시간</th><td>${Math.round((networkPath.totalDistance / WALKING_M_PER_MIN) * 10) / 10}분</td></tr>
        </tbody>
      </table>
      <p class="research-note">직선거리 기반 경로는 점포 간 공간적 근접성만 반영하지만, 보행 네트워크 기반 경로는 실제 보행 가능한 인도·골목 구조와 방문 순서 최적화를 함께 반영하므로 전통시장 내부 이동 현실성을 더 잘 나타냅니다.</p>
    `;
  }

  function updateNetworkStatus(message) {
    const status = document.querySelector("#networkRouteStatus");
    if (!status) return;
    if (message) {
      status.textContent = message;
      return;
    }
    status.textContent = networkIsUsable()
      ? `보행 네트워크 초안 로드됨: 노드 ${formatNumber(network.nodes.length)}개, 엣지 ${formatNumber(network.edges.length)}개. 경로 계산에 Dijkstra를 사용할 수 있습니다.`
      : "현재는 보행 네트워크 데이터가 없어 직선거리 기반 예비 경로를 표시합니다.";
  }

  function attachNetworkEvents() {
    document.querySelector("#toggleNetworkEdit").addEventListener("click", (event) => {
      network.editMode = !network.editMode;
      event.currentTarget.textContent = network.editMode ? "편집 모드 끄기" : "편집 모드 켜기";
      event.currentTarget.classList.toggle("active", network.editMode);
    });
    document.querySelectorAll("[data-network-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        network.tool = button.dataset.networkTool;
        document.querySelectorAll("[data-network-tool]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
      });
    });
    document.querySelector("#deleteNetworkNode").addEventListener("click", deleteSelectedNode);
    document.querySelector("#deleteNetworkEdge").addEventListener("click", deleteSelectedEdge);
    document.querySelector("#autoConnectNetwork").addEventListener("click", autoConnectNetwork);
    document.querySelector("#clearNetworkEdges").addEventListener("click", clearNetworkEdges);
    document.querySelector("#clearNetworkNodes").addEventListener("click", clearNetworkNodes);
    document.querySelector("#downloadNetworkNodes").addEventListener("click", () => downloadJson("network_nodes_edited.geojson", nodesGeojson()));
    document.querySelector("#downloadNetworkEdges").addEventListener("click", () => downloadJson("network_edges_edited.geojson", edgesGeojson()));
    document.querySelector("#downloadNetworkReport").addEventListener("click", () => downloadText("network_validation_report.md", validationMarkdown()));
    document.querySelector("#validateNetwork").addEventListener("click", validateNetwork);
    document.querySelector("#saveNetworkProperties").addEventListener("click", saveSelectedProperties);
    document.querySelector("#loadNetworkNodes").addEventListener("change", (event) => {
      readFileAsJson(event.target, (geojson) => {
        network.nodes = (geojson.features || []).map(parseNodeFeature).filter((node) => node.node_id);
        renderNetwork();
        updateNetworkStatus();
        renderRecommendations();
      });
    });
    document.querySelector("#loadNetworkEdges").addEventListener("change", (event) => {
      readFileAsJson(event.target, (geojson) => {
        network.edges = (geojson.features || []).map(parseEdgeFeature).filter((edge) => edge.edge_id);
        renderNetwork();
        updateNetworkStatus();
        renderRecommendations();
      });
    });
    if (map) {
      map.on("click", (event) => {
        if (network.editMode && network.tool === "node") addNode(event.latlng);
      });
    }
  }

  function initNetworkEditor() {
    injectNetworkUi();
    initNetworkLayers();
    attachNetworkEvents();
    loadExistingNetwork();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNetworkEditor);
  } else {
    initNetworkEditor();
  }
})();



