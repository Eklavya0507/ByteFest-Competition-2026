(function(){
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
  function badge(text){return el('span','qv-badge',text)}
  function card(title,value,accent){const n=el('div','qv-card');if(accent)n.dataset.accent=accent;const a=el('small','',title);const b=el('strong','',String(value));n.append(a,b);return n}
  function setAnswer(input,value){if(!input)return;input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.focus()}
  function matrix(root,matrix,pixel=false){const grid=el('div',pixel?'qv-matrix qv-pixels':'qv-matrix');const cols=Math.max(...matrix.map(r=>r.length));grid.style.setProperty('--cols',cols);matrix.forEach(row=>row.forEach(v=>{const cell=el('div','qv-cell',String(v));if(pixel){cell.classList.toggle('on',String(v)==='1');cell.classList.toggle('off',String(v)!=='1')}grid.appendChild(cell)}));root.appendChild(grid);return grid}
  function choiceButtons(root,choices,input){const wrap=el('div','qv-choices');(choices||[]).forEach(ch=>{const b=el('button','qv-choice',ch);b.type='button';b.onclick=()=>{wrap.querySelectorAll('.selected').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');let value=ch;const m=String(ch).match(/^([A-Z])\s*[-–]/);if(m)value=m[1];setAnswer(input,value)};wrap.appendChild(b)});root.appendChild(wrap)}
  function rotateMatrix(root,source){let m=source.map(r=>r.slice());const holder=el('div','qv-rotate-holder');const g=matrix(holder,m);const btn=el('button','qv-tool-btn','ROTATE 90° CLOCKWISE');btn.type='button';btn.onclick=()=>{m=m[0].map((_,i)=>m.map(r=>r[i]).reverse());holder.innerHTML='';matrix(holder,m)};root.append(holder,btn)}
  function grid(root,rows){const g=el('div','qv-grid');const cols=rows[0]?.length||1;g.style.setProperty('--cols',cols);rows.forEach(row=>[...row].forEach(ch=>{const cell=el('div','qv-grid-cell',ch==='.'?'':ch);if(ch==='#')cell.classList.add('wall');if(ch==='S')cell.classList.add('start');if(ch==='E')cell.classList.add('end');g.appendChild(cell)}));root.appendChild(g)}
  function stackQueue(root,ui){const wrap=el('div','qv-sq');const s=el('div','qv-sq-col');s.append(el('h4','', 'STACK'));[...(ui.stack||[])].reverse().forEach((v,i)=>s.append(card(i===0?'TOP':'',v,'cyan')));const q=el('div','qv-sq-col');q.append(el('h4','', 'QUEUE'));(ui.queue||[]).forEach((v,i)=>q.append(card(i===0?'FRONT':i===ui.queue.length-1?'REAR':'',v,'violet')));const ops=el('div','qv-ops');(ui.operations||[]).forEach((op,i)=>ops.append(card(`STEP ${i+1}`,op,'green')));wrap.append(s,q,ops);root.appendChild(wrap)}
  function network(root,ui){const n=el('div','qv-network');const nodes=el('div','qv-nodes');(ui.nodes||[]).forEach(x=>nodes.append(card('NODE',x,String(x).includes('BLOCKED')?'red':'cyan')));const edges=el('div','qv-edge-list');(ui.edges||[]).forEach(x=>edges.append(badge(x)));n.append(nodes,edges);if(ui.secure?.length){const p=el('p','qv-note',`Secure nodes: ${ui.secure.join(', ')}`);n.appendChild(p)}root.appendChild(n)}

  function circuitBoard(root,ui){
    const board=el('div','qv-circuit');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('qv-circuit-svg');
    const cols=el('div','qv-circuit-cols');
    const inputCol=el('div','qv-circuit-col');inputCol.append(el('h4','','INPUTS'));
    const gateCol=el('div','qv-circuit-col');gateCol.append(el('h4','','GATES'));
    const outCol=el('div','qv-circuit-col');outCol.append(el('h4','','OUTPUT / KEY'));
    const nodes=[];
    (ui.inputs||[]).forEach(v=>{const name=String(v).split('=')[0].trim();const b=el('button','qv-circuit-node',String(v));b.type='button';b.dataset.node=name;inputCol.append(b);nodes.push(b)});
    (ui.gates||[]).forEach(v=>{const name=String(v).split('=')[0].trim();const b=el('button','qv-circuit-node gate',String(v));b.type='button';b.dataset.node=name;gateCol.append(b);nodes.push(b)});
    const output=el('div','qv-circuit-output',ui.outputOrder?`READ ${ui.outputOrder}`:'FINAL OUTPUT');outCol.append(output);
    const instruction=el('p','qv-note','Connect nodes as a scratch circuit: tap a source, then tap the gate/output it feeds. Connections are your workspace; the server still checks only the final answer.');
    const wires=el('div','qv-wire-list');
    const reset=el('button','qv-tool-btn','RESET WIRES');reset.type='button';
    cols.append(inputCol,gateCol,outCol);board.append(svg,cols);root.append(board,instruction,wires,reset);
    let selected=null,links=[];
    function redraw(){
      svg.replaceChildren();
      const br=board.getBoundingClientRect();
      links.forEach(([a,b])=>{const ar=a.getBoundingClientRect(),bb=b.getBoundingClientRect();const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',ar.left+ar.width/2-br.left);line.setAttribute('y1',ar.top+ar.height/2-br.top);line.setAttribute('x2',bb.left+bb.width/2-br.left);line.setAttribute('y2',bb.top+bb.height/2-br.top);line.setAttribute('class','qv-circuit-line');svg.append(line)});
      wires.replaceChildren(...links.map(([a,b])=>badge(`${a.dataset.node} → ${b.dataset.node}`)));
    }
    nodes.forEach(node=>node.onclick=()=>{
      if(!selected){selected=node;node.classList.add('selected');return}
      if(selected===node){selected.classList.remove('selected');selected=null;return}
      links.push([selected,node]);selected.classList.remove('selected');selected=null;redraw();
    });
    output.onclick=()=>{if(!selected)return;links.push([selected,output]);selected.classList.remove('selected');selected=null;redraw()};
    reset.onclick=()=>{links=[];if(selected)selected.classList.remove('selected');selected=null;redraw()};
    addEventListener('resize',redraw);
  }
  function codeLines(root,ui,input){const pre=el('div','qv-code');(ui.code||[]).forEach((line,i)=>{const r=el('button','qv-code-line');r.type='button';r.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span><code></code>`;r.querySelector('code').textContent=line;r.onclick=()=>{if(!ui.multiSelect)pre.querySelectorAll('.selected').forEach(x=>x.classList.remove('selected'));r.classList.toggle('selected');if(!ui.multiSelect)setAnswer(input,`Line ${i+1}`)};pre.appendChild(r)});root.appendChild(pre);if(ui.choices)choiceButtons(root,ui.choices,input)}
  function bars(root,rows,prime){const wrap=el('div','qv-barcode');(rows||[]).forEach((row,i)=>{const r=el('div','qv-bar-row');r.append(el('b','',`#${i+1}`));[...row].forEach(bit=>{const bitEl=el('span',bit==='1'?'on':'off');r.append(bitEl)});if(prime?.includes(i+1))r.classList.add('prime');wrap.append(r)});root.appendChild(wrap)}
  function genericCards(root,items,label){const g=el('div','qv-cards');(items||[]).forEach((x,i)=>g.append(card(`${label||'ITEM'} ${i+1}`,x,['cyan','green','violet','orange'][i%4])));root.appendChild(g)}
  function stateTable(root,rows){const t=el('div','qv-state-table');(rows||[]).forEach(r=>{const row=el('div','qv-state-row');r.forEach(v=>row.append(el('span','',String(v))));t.append(row)});root.appendChild(t)}
  function render(question,{mount,input}={}){
    if(!mount)return;
    let root=mount.querySelector('.qv-root');
    if(!root){root=el('div','qv-root');mount.appendChild(root)}
    root.replaceChildren();
    const ui=question.ui||{};const top=el('div','qv-top');top.append(badge((question.type||'challenge').replaceAll('-',' ').toUpperCase()));if(question.maxPoints)top.append(badge(`${question.maxPoints} PTS`));root.append(top);
    const kind=ui.kind||question.type;
    if(ui.badges){const b=el('div','qv-badges');ui.badges.forEach(x=>b.append(badge(x)));root.append(b)}
    if(kind==='matrix'||kind==='pixel-matrix'){matrix(root,ui.matrix||[],kind==='pixel-matrix')}
    else if(kind==='matrix-rotation'){rotateMatrix(root,ui.matrix||[])}
    else if(kind==='robot-grid'){grid(root,ui.grid||[]);const tools=el('div','qv-command-tools');(ui.commands||[]).forEach(cmd=>{const b=el('button','qv-tool-btn',cmd);b.type='button';b.onclick=()=>{const log=root.querySelector('.qv-command-log');log.textContent=(log.textContent+' '+cmd).trim()};tools.append(b)});const reset=el('button','qv-tool-btn','RESET');reset.type='button';reset.onclick=()=>root.querySelector('.qv-command-log').textContent='';tools.append(reset);const log=el('div','qv-command-log','');root.append(tools,log);if(ui.pattern)genericCards(root,ui.pattern,'PATTERN')}
    else if(kind==='stack-queue'){stackQueue(root,ui)}
    else if(kind==='gates'||kind==='gates-connect'){circuitBoard(root,ui)}
    else if(kind==='network'){network(root,ui)}
    else if(kind==='barcode'){bars(root,ui.rows||[],ui.primePositions||[])}
    else if(kind==='code-lines'){codeLines(root,ui,input)}
    else if(kind==='choices'){choiceButtons(root,ui.choices||[],input);if(ui.note)root.append(el('p','qv-note',ui.note))}
    else if(kind==='flowchart'){genericCards(root,ui.nodes,'FLOW');if(ui.choices)choiceButtons(root,ui.choices,input)}
    else if(kind==='patch'){codeLines(root,{code:ui.code||[]},input);if(ui.fields)genericCards(root,ui.fields,'PATCH')}
    else if(kind==='state-table'){stateTable(root,ui.rows||[]);if(ui.choices)choiceButtons(root,ui.choices,input)}
    else if(kind==='logs'){const log=el('pre','qv-log',(ui.lines||[]).join('\n'));root.append(log);if(ui.choices)choiceButtons(root,ui.choices,input)}
    else if(kind==='test-results'){if(ui.visible)genericCards(root,ui.visible,'VISIBLE');if(ui.hidden)genericCards(root,ui.hidden,'HIDDEN')}
    else if(kind==='critical'){codeLines(root,{code:ui.code||[],multiSelect:true},input);if(ui.tests)genericCards(root,ui.tests,'TEST')}
    else if(kind==='rules'){if(ui.start)root.append(card('START',ui.start,'cyan'));genericCards(root,ui.rules,'RULE');if(ui.checkpoints)genericCards(root,ui.checkpoints,'CHECKPOINT')}
    else if(kind==='memory'){genericCards(root,ui.slots,'MEMORY')}
    else if(kind==='filter-cards'){genericCards(root,ui.values,'VALUE');root.append(el('p','qv-note',`${ui.rule||''} · ${(ui.conditions||[]).join(' · ')}`))}
    else if(kind==='sensor-cards'){genericCards(root,ui.cards,'SENSOR')}
    else if(kind==='cards'){genericCards(root,ui.cards,'CARD');if(ui.choices)choiceButtons(root,ui.choices,input)}
    else if(ui.matrix)matrix(root,ui.matrix,false)
  }
  window.BytefestQuestionUI={render};
}());
