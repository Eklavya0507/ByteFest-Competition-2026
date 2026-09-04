(function(){
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  function render(question,{mount,editor}={}){
    if(!mount)return;
    let root=mount.querySelector('.qv-root');
    if(!root){root=document.createElement('div');root.className='qv-root';mount.appendChild(root)}
    const ui=question.ui||{};
    root.innerHTML=`
      <div class="qv-professional-head">
        <span class="qv-chip">${esc(ui.patchLimit||'PATCH CHALLENGE')}</span>
        <span class="qv-chip strong">${esc(question.maxPoints||0)} POINTS</span>
      </div>
      ${ui.sampleInput!==undefined?`<div class="qv-evidence"><small>VISIBLE INPUT / SCENARIO</small><div>${esc(ui.sampleInput)}</div></div>`:''}
      <div class="qv-editor-label"><span>CODE WORKSPACE</span><small>Edit the code directly and submit the minimum safe patch.</small></div>
    `;
    if(editor){
      editor.value=(ui.code||[]).join('\n');
      editor.dataset.original=editor.value;
    }
  }
  window.BytefestQuestionUI={render};
}());
