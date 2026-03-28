/* ================================
   KNOWLEDGE GRAPH JAVASCRIPT
   ================================ */
'use strict';

let graphSimulation = null;
let graphData = null;
let graphSvg = null;
let graphZoom = null;

window.initGraph = async function() {
  const container = document.getElementById('graph-container');
  if (!container) return;

  // Show status
  container.innerHTML = '<div style="display:grid; place-items:center; height:100%; color: var(--text-muted); font-size: 13px;">Mapping connections...</div>';

  try {
    const response = await fetch('/api/notes/graph', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('nv_token')}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch graph data');
    graphData = await response.json();

    if (!graphData.nodes || graphData.nodes.length === 0) {
      container.innerHTML = '<div style="display:grid; place-items:center; height:100%; color: var(--text-muted); text-align: center; padding: 20px;">' +
        '<div style="font-size: 32px; margin-bottom: 12px;">🕸️</div>' +
        '<div>Your vault is isolated. <br/>Link notes using <b>[[Title]]</b> to see connections here.</div>' +
        '</div>';
      return;
    }

    renderGraph(graphData);
  } catch (err) {
    console.error('[graph] init error:', err);
    container.innerHTML = '<div style="display:grid; place-items:center; height:100%; color: var(--error);">Failed to load graph.</div>';
  }
};

function renderGraph(data) {
  const container = document.getElementById('graph-container');
  const width = container.clientWidth;
  const height = container.clientHeight;
  container.innerHTML = '';

  const svg = d3.select('#graph-container')
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', [0, 0, width, height]);

  graphSvg = svg;

  const g = svg.append('g');

  // Zoom behavior
  graphZoom = d3.zoom()
    .scaleExtent([0.1, 8])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(graphZoom);

  // Simulation
  graphSimulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id(d => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-150))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(30));

  // Edges
  const link = g.append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(data.links)
    .join('line')
    .attr('class', 'graph-link');

  // Nodes
  const node = g.append('g')
    .attr('class', 'nodes')
    .selectAll('.node-group')
    .data(data.nodes)
    .join('g')
    .attr('class', 'node-group')
    .call(drag(graphSimulation))
    .on('click', (event, d) => {
      if (typeof openNote === 'function') {
        openNote(parseInt(d.id));
        switchView('notes');
      }
    });

  node.append('circle')
    .attr('r', 6)
    .attr('class', d => `graph-node node-${d.tag || 'general'}`);

  node.append('text')
    .attr('class', 'graph-label')
    .attr('dy', 12)
    .text(d => d.title);

  // Simulation Tick
  graphSimulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node
      .attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // Center view
  resetGraphView();
}

function drag(simulation) {
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  return d3.drag()
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended);
}

window.resetGraphView = function() {
  if (graphSvg && graphZoom) {
    const container = document.getElementById('graph-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    graphSvg.transition()
      .duration(750)
      .call(graphZoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
  }
};

// Re-render on window resize
window.addEventListener('resize', () => {
  if (currentView === 'graph') {
    renderGraph(graphData);
  }
});
