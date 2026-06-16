(function(){
  'use strict';

  const ALIGN_STATE={reads:[],results:[],selected:0};
  const ALIGN_SCORE={match:1,mismatch:-2,gap:-3};

  function $(id){ return document.getElementById(id); }
  function esc(value){ return String(value==null?'':value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function safeName(file){ return String(file&&file.name||'Sanger read').replace(/\.[^.]+$/,''); }
  function avg(values){ return values&&values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0; }
  function baseAt(seq,pos){ return seq[(pos-1+seq.length)%seq.length]||'N'; }
  function compBase(b){ return ({A:'T',T:'A',G:'C',C:'G',R:'Y',Y:'R',S:'S',W:'W',K:'M',M:'K',B:'V',D:'H',H:'D',V:'B',N:'N'})[String(b||'N').toUpperCase()]||'N'; }
  function exactBase(b){ return /^[ACGT]$/.test(String(b||'')); }

  function installCss(){
    if($('plasmidlab-alignment-css')) return;
    const style=document.createElement('style');
    style.id='plasmidlab-alignment-css';
    style.textContent=`
      .alignPanel{border:1px solid var(--line);border-radius:14px;background:#fff;box-shadow:var(--shadow);overflow:hidden}
      .alignHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:14px 16px;border-bottom:1px solid var(--line);background:#f8fbff}
      .alignHead h2{margin:0 0 4px 0;font-size:16px;color:#26364d}
      .alignBody{padding:14px 16px}
      .alignDrop{border:1px dashed #9bb8f7;border-radius:14px;background:#f8fbff;padding:12px;margin-bottom:10px}
      .alignControls{display:grid;grid-template-columns:1.6fr .8fr .8fr .8fr;gap:8px;align-items:end}
      .alignControls label{font-size:12px;color:var(--muted)}
      .alignControls input,.alignControls select{margin-top:4px}
      .alignReadList{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      .alignReadChip{border:1px solid var(--line);border-radius:999px;background:#fff;padding:7px 10px;cursor:pointer}
      .alignReadChip.active{background:var(--pri);border-color:var(--pri);color:#fff}
      .alignStats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:10px 0}
      .alignStat{border:1px solid var(--line);border-radius:12px;background:#fbfcff;padding:10px}
      .alignStat b{font-size:16px;color:#1f2937}
      .alignGrid{display:grid;grid-template-columns:1fr;gap:12px}
      .alignBox{border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden}
      .alignBox h3{margin:0;padding:10px 12px;font-size:14px;background:#f8fafc;border-bottom:1px solid var(--line)}
      .alignSeq{font-family:var(--mono);font-size:12px;line-height:1.5;white-space:pre;overflow:auto;max-height:420px;padding:12px;background:#fffaf0}
      .alignSeq .alnMatch{color:#111827}
      .alignSeq .alnMis{background:#ffd6d6;color:#9b1c1c;font-weight:700}
      .alignSeq .alnIns{background:#dbeafe;color:#1d4ed8;font-weight:700}
      .alignSeq .alnDel{background:#fee2b3;color:#92400e;font-weight:700}
      .alignSeq .alnLow{border-bottom:2px dotted #b45309}
      .alignVariantTable{max-height:360px;overflow:auto}
      .alignVariantTable table{font-size:12px}
      .alignVariantTable .strongVar{color:#991b1b;font-weight:700}
      .alignVariantTable .weakVar{color:#92400e}
      .alignHelp{background:#eef6ff;border:1px solid #bfdbfe;border-radius:12px;padding:10px;color:#1e3a8a;line-height:1.5}
      @media(max-width:900px){.alignControls{grid-template-columns:1fr 1fr}.alignHead{display:block}.alignSeq{font-size:11px}}
      @media(max-width:520px){.alignControls{grid-template-columns:1fr}.alignBody{padding:10px}.alignSeq{font-size:10.5px}}
    `;
    document.head.appendChild(style);
  }

  function installUi(){
    installCss();
    if($('alignView')) return;
    const switcher=document.querySelector('.viewSwitch');
    if(switcher&&!$('alignViewBtn')){
      const btn=document.createElement('button');
      btn.type='button';
      btn.id='alignViewBtn';
      btn.dataset.view='align';
      btn.textContent='测序比对';
      switcher.insertBefore(btn,switcher.querySelector('[data-view="tools"]')||null);
      btn.onclick=()=>showAlignmentView();
    }
    const main=document.querySelector('.mainGrid');
    const tools=$('toolsView');
    const host=document.createElement('div');
    host.id='alignView';
    host.className='hidden';
    host.innerHTML=`
      <div class="alignPanel">
        <div class="alignHead">
          <div>
            <h2>Sanger 测序比对（.ab1 / .abi）</h2>
            <div class="small">逐条 read 比到当前质粒参考序列；自动判断正反向、隐藏低质量两端，并标出碱基和 CDS 氨基酸影响。</div>
          </div>
          <button type="button" id="alignClearBtn">清空比对结果</button>
        </div>
        <div class="alignBody">
          <div class="alignHelp">
            原则：每个 .ab1 文件独立比对到当前打开的质粒，不做 consensus 组装。默认 Phred ≥20 且 20 bp 滑窗通过后才进入核心比对；低质量错配会被标为疑点，高质量错配会作为突变证据。
          </div>
          <div class="alignDrop mt">
            <div class="alignControls">
              <label>选择测序文件（不限制格式，推荐 .ab1）
                <input id="alignFileInput" type="file" multiple>
              </label>
              <label>质量阈值
                <select id="alignQCut">
                  <option value="15">Phred 15</option>
                  <option value="20" selected>Phred 20</option>
                  <option value="25">Phred 25</option>
                  <option value="30">Phred 30</option>
                </select>
              </label>
              <label>裁剪窗口
                <select id="alignWindow">
                  <option value="12">12 bp</option>
                  <option value="20" selected>20 bp</option>
                  <option value="30">30 bp</option>
                </select>
              </label>
              <label>最低比对长度
                <select id="alignMinLen">
                  <option value="30">30 bp</option>
                  <option value="40" selected>40 bp</option>
                  <option value="80">80 bp</option>
                </select>
              </label>
            </div>
            <div class="row mt">
              <button type="button" class="primary" id="alignRunBtn">导入 .ab1 并比对当前质粒</button>
              <button type="button" id="alignExportBtn">导出比对报告 TSV</button>
            </div>
          </div>
          <div id="alignStatus" class="status hidden"></div>
          <div id="alignReadList" class="alignReadList"></div>
          <div id="alignSummary"></div>
          <div id="alignOutput"></div>
        </div>
      </div>
    `;
    if(main){
      if(tools && tools.parentNode===main) main.insertBefore(host,tools);
      else main.appendChild(host);
    }
    $('alignRunBtn').onclick=()=>runSelectedAlignmentFiles();
    $('alignFileInput').onchange=()=>runSelectedAlignmentFiles();
    $('alignClearBtn').onclick=()=>{ALIGN_STATE.reads=[];ALIGN_STATE.results=[];ALIGN_STATE.selected=0;renderAlignmentResults();setAlignStatus('已清空测序比对结果。');};
    $('alignExportBtn').onclick=exportAlignmentReport;
    patchShowView();
  }

  function patchShowView(){
    if(window.__plabAlignmentShowViewPatched) return;
    window.__plabAlignmentShowViewPatched=true;
    const oldShow=typeof showView==='function'?showView:null;
    try{
      showView=function(v){
        if(v==='align') return showAlignmentView();
        if($('alignView')) $('alignView').classList.add('hidden');
        document.querySelector('[data-view="align"]')?.classList.remove('active');
        if(oldShow) return oldShow(v);
      };
      window.showView=showView;
    }catch(e){}
  }

  function showAlignmentView(){
    ['map','seq','features','enzymes','primers','tools'].forEach(v=>{
      const el=$(v+'View'); if(el) el.classList.add('hidden');
      document.querySelector(`[data-view="${v}"]`)?.classList.remove('active');
    });
    $('alignView')?.classList.remove('hidden');
    document.querySelector('[data-view="align"]')?.classList.add('active');
    try{currentView='align';}catch(e){}
    renderAlignmentResults();
  }

  function setAlignStatus(text,kind){
    const el=$('alignStatus');
    if(!el) return;
    el.textContent=text;
    el.classList.remove('hidden');
    el.classList.toggle('warn',kind==='warn');
    el.classList.toggle('ok',kind==='ok');
  }

  function readAbifDirectory(buffer){
    const bytes=new Uint8Array(buffer);
    const view=new DataView(buffer);
    const ascii=new TextDecoder('ascii');
    function text(offset,length){ return ascii.decode(bytes.subarray(offset,offset+length)).replace(/\0+$/g,''); }
    if(text(0,4)!=='ABIF') throw new Error('不是 ABI/ABIF 格式文件');
    function dir(offset){
      return {
        name:text(offset,4),
        number:view.getInt32(offset+4,false),
        type:view.getInt16(offset+8,false),
        elementSize:view.getInt16(offset+10,false),
        elementCount:view.getInt32(offset+12,false),
        dataSize:view.getInt32(offset+16,false),
        dataOffset:view.getInt32(offset+20,false),
        inlineOffset:offset+20
      };
    }
    const root=dir(6);
    const dirs=[];
    for(let i=0;i<root.elementCount;i++) dirs.push(dir(root.dataOffset+i*28));
    function tag(name,number){ return dirs.find(d=>d.name===name&&d.number===number); }
    function tagBytes(t){ const o=t.dataSize<=4?t.inlineOffset:t.dataOffset; return bytes.subarray(o,o+t.dataSize); }
    function tagInts(t){
      const b=tagBytes(t), dv=new DataView(b.buffer,b.byteOffset,b.byteLength), out=[];
      const size=t.elementSize||({1:1,2:1,3:2,4:2,5:4,7:4,8:4,10:1,11:1,12:2,13:4,14:4,15:4,18:1,19:1}[t.type]||1);
      for(let i=0;i<t.elementCount;i++){
        const o=i*size;
        if(size===1) out.push(b[o]||0);
        else if(size===2) out.push(dv.getInt16(o,false));
        else out.push(dv.getInt32(o,false));
      }
      return out;
    }
    return {bytes,ascii,dirs,tag,tagBytes,tagInts};
  }

  function parseAbiRead(buffer,name){
    const abif=readAbifDirectory(buffer);
    const baseTag=abif.tag('PBAS',2)||abif.tag('PBAS',1);
    if(!baseTag) throw new Error('AB1 中没有 PBAS base calls');
    const seq=abif.ascii.decode(abif.tagBytes(baseTag)).replace(/[^A-Za-z]/g,'').toUpperCase().replace(/U/g,'T').replace(/[^ACGTRYSWKMBDHVN]/g,'N');
    const qTag=abif.tag('PCON',2)||abif.tag('PCON',1);
    const pTag=abif.tag('PLOC',2)||abif.tag('PLOC',1);
    const orderTag=abif.tag('FWO_',1);
    const quality=qTag?[...abif.tagBytes(qTag)]:[];
    const peakLocations=pTag?abif.tagInts(pTag):[];
    const channelOrder=orderTag?abif.ascii.decode(abif.tagBytes(orderTag)).replace(/\0/g,''):'';
    const traces=[9,10,11,12].map(n=>{
      const t=abif.tag('DATA',n);
      return t?abif.tagInts(t):[];
    });
    if(!seq || seq.length<10) throw new Error('AB1 base calls 过短或无法识别');
    return {name:name||'Sanger read',seq,quality,peakLocations,channelOrder,traces,rawLength:seq.length};
  }

  function trimByQuality(read,cutoff,windowSize){
    const seq=read.seq||'', q=read.quality||[];
    if(!q.length || q.length!==seq.length) return {...read,trimStart:0,trimEnd:seq.length,trimmedSeq:seq,trimmedQuality:q.slice(),trimNote:'无质量值，未自动裁剪'};
    const n=seq.length, w=Math.max(5,Math.min(windowSize||20,n));
    function goodWindow(start){
      let sum=0, bad=0, nCount=0;
      for(let i=start;i<Math.min(n,start+w);i++){
        sum+=q[i]||0;
        if((q[i]||0)<cutoff) bad++;
        if(seq[i]==='N') nCount++;
      }
      const len=Math.min(n,start+w)-start;
      return len>=Math.min(w,n-start) && sum/len>=cutoff && bad/len<=0.35 && nCount/len<=0.25;
    }
    let left=0;
    while(left<n-w && !goodWindow(left)) left++;
    let right=n;
    while(right-w>left && !goodWindow(right-w)) right--;
    if(right-left<30){ left=0; right=n; }
    return {
      ...read,
      trimStart:left,
      trimEnd:right,
      trimmedSeq:seq.slice(left,right),
      trimmedQuality:q.slice(left,right),
      trimNote:`隐藏 5' ${left} bp，3' ${n-right} bp`
    };
  }

  function scorePair(a,b){
    if(!a||!b) return ALIGN_SCORE.mismatch;
    if(a===b && exactBase(a)) return ALIGN_SCORE.match;
    if(a==='N'||b==='N') return -1;
    return ALIGN_SCORE.mismatch;
  }

  function smithWaterman(readSeq,refSeq,refLen){
    const n=readSeq.length, m=refSeq.length;
    const prev=new Int32Array(m+1);
    const curr=new Int32Array(m+1);
    const trace=new Uint8Array((n+1)*(m+1));
    let best=0,bestI=0,bestJ=0;
    for(let i=1;i<=n;i++){
      curr[0]=0;
      const rb=readSeq[i-1];
      const rowBase=i*(m+1);
      const prevBase=(i-1)*(m+1);
      for(let j=1;j<=m;j++){
        const diag=prev[j-1]+scorePair(rb,refSeq[j-1]);
        const left=curr[j-1]+ALIGN_SCORE.gap;
        const up=prev[j]+ALIGN_SCORE.gap;
        let val=0,dir=0;
        if(diag>=left && diag>=up && diag>0){ val=diag; dir=1; }
        else if(left>=up && left>0){ val=left; dir=2; }
        else if(up>0){ val=up; dir=3; }
        curr[j]=val;
        trace[rowBase+j]=dir;
        if(val>best){ best=val; bestI=i; bestJ=j; }
      }
      prev.set(curr);
    }
    let i=bestI,j=bestJ;
    const refAln=[],readAln=[],refIdx=[],readIdx=[];
    while(i>0&&j>0){
      const dir=trace[i*(m+1)+j];
      if(!dir) break;
      if(dir===1){
        refAln.push(refSeq[j-1]); readAln.push(readSeq[i-1]); refIdx.push(j); readIdx.push(i); i--; j--;
      }else if(dir===2){
        refAln.push(refSeq[j-1]); readAln.push('-'); refIdx.push(j); readIdx.push(null); j--;
      }else{
        refAln.push('-'); readAln.push(readSeq[i-1]); refIdx.push(null); readIdx.push(i); i--;
      }
    }
    refAln.reverse(); readAln.reverse(); refIdx.reverse(); readIdx.reverse();
    let matches=0,mismatches=0,gaps=0,alignedBases=0;
    for(let k=0;k<refAln.length;k++){
      const r=refAln[k], q=readAln[k];
      if(r==='-'||q==='-'){ gaps++; continue; }
      alignedBases++;
      if(r===q && exactBase(r)) matches++; else mismatches++;
    }
    const mapped=refIdx.filter(v=>v!=null).map(v=>((v-1)%refLen)+1);
    return {
      score:best,
      refAln:refAln.join(''),
      readAln:readAln.join(''),
      refIdx,readIdx,
      matches,mismatches,gaps,alignedBases,
      identity:alignedBases?matches/alignedBases:0,
      refStart:mapped.length?mapped[0]:null,
      refEnd:mapped.length?mapped[mapped.length-1]:null,
      readStart:i+1,
      readEnd:bestI
    };
  }

  function alignOneRead(read,plasmid,options){
    const cutoff=parseInt(options.cutoff)||20;
    const windowSize=parseInt(options.windowSize)||20;
    const minLen=parseInt(options.minLen)||40;
    const trimmed=trimByQuality(read,cutoff,windowSize);
    if(trimmed.trimmedSeq.length<minLen) throw new Error(`${read.name}: 质量裁剪后长度 ${trimmed.trimmedSeq.length} bp，小于最低 ${minLen} bp`);
    const ref=cleanDNA(plasmid.seq);
    const ext=plasmid.circular ? ref+ref.slice(0,Math.min(ref.length,trimmed.trimmedSeq.length+80)) : ref;
    const fwd=smithWaterman(trimmed.trimmedSeq,ext,ref.length);
    const revSeq=rc(trimmed.trimmedSeq);
    const revQual=(trimmed.trimmedQuality||[]).slice().reverse();
    const rev=smithWaterman(revSeq,ext,ref.length);
    const chosen=(rev.score>fwd.score)?rev:fwd;
    const orientation=(rev.score>fwd.score)?'-':'+';
    const orientedQuality=orientation==='-'?revQual:(trimmed.trimmedQuality||[]);
    const variants=callVariants(chosen,orientedQuality,plasmid);
    const aaImpacts=variants.flatMap(v=>v.impacts||[]).filter(Boolean);
    return {read,trimmed,alignment:chosen,orientation,variants,aaImpacts,options:{cutoff,windowSize,minLen}};
  }

  function callVariants(aln,quality,plasmid){
    const out=[];
    let lastRef=null;
    for(let k=0;k<aln.refAln.length;k++){
      const rb=aln.refAln[k], qb=aln.readAln[k];
      const refRaw=aln.refIdx[k];
      const refPos=refRaw==null?null:((refRaw-1)%plasmid.seq.length)+1;
      const readPos=aln.readIdx[k];
      if(refPos!=null) lastRef=refPos;
      if(rb==='-'&&qb!=='-'){
        const q=readPos?quality[readPos-1]:null;
        out.push({type:'ins',pos:lastRef,ref:'-',read:qb,readPos,quality:q,confidence:confidence(q),label:`${lastRef} 后插入 ${qb}`});
      }else if(rb!=='-'&&qb==='-'){
        out.push({type:'del',pos:refPos,ref:rb,read:'-',readPos:null,quality:null,confidence:'strong',label:`${refPos} 删除 ${rb}`});
      }else if(rb!==qb){
        const q=readPos?quality[readPos-1]:null;
        const type=qb==='N'?'ambiguous':'mismatch';
        out.push({type,pos:refPos,ref:rb,read:qb,readPos,quality:q,confidence:confidence(q),label:`${refPos} ${rb}→${qb}`});
      }
    }
    out.forEach(v=>{ v.impacts=variantImpacts(v,plasmid); });
    return out;
  }

  function confidence(q){
    if(q==null) return 'unknown';
    if(q>=30) return 'strong';
    if(q>=20) return 'medium';
    return 'weak';
  }

  function featurePositions(plasmid,f){
    const n=plasmid.seq.length, s=parseInt(f.start), e=parseInt(f.end);
    const arr=[];
    if(!s||!e) return arr;
    if(s<=e){ for(let p=s;p<=e;p++) arr.push(p); }
    else{ for(let p=s;p<=n;p++) arr.push(p); for(let p=1;p<=e;p++) arr.push(p); }
    if((f.strand||'+')==='-') arr.reverse();
    return arr;
  }

  function codonForPositions(plasmid,positions,strand,mut){
    return positions.map(pos=>{
      let b=(mut&&mut[pos])||baseAt(plasmid.seq,pos);
      return strand==='-'?compBase(b):b;
    }).join('');
  }

  function variantImpacts(v,plasmid){
    const impacts=[];
    const feats=(plasmid.features||[]).filter(f=>/CDS|coding/i.test(String(f.type||'')) || f.translate);
    feats.forEach(f=>{
      const positions=featurePositions(plasmid,f);
      const idx=positions.indexOf(v.pos);
      if(idx<0) return;
      if(v.type==='ins'||v.type==='del'){
        impacts.push(`${f.name||'CDS'}: ${v.type==='ins'?'插入':'删除'} 1 bp，可能移码`);
        return;
      }
      if(v.type!=='mismatch' || !exactBase(v.read)) return;
      const codonIndex=Math.floor(idx/3);
      const codonPos=positions.slice(codonIndex*3,codonIndex*3+3);
      if(codonPos.length<3) return;
      const mut={}; mut[v.pos]=v.read;
      const strand=f.strand||'+';
      const refCodon=codonForPositions(plasmid,codonPos,strand,null);
      const mutCodon=codonForPositions(plasmid,codonPos,strand,mut);
      const refAa=translate(refCodon)||'X';
      const mutAa=translate(mutCodon)||'X';
      let kind=refAa===mutAa?'沉默':(mutAa==='*'?'终止':'错义');
      impacts.push(`${f.name||'CDS'} aa${codonIndex+1}: ${refCodon}(${refAa}) → ${mutCodon}(${mutAa})，${kind}`);
    });
    return impacts;
  }

  async function runSelectedAlignmentFiles(){
    const input=$('alignFileInput');
    if(!input||!input.files||!input.files.length){ setAlignStatus('请先选择 .ab1 / .abi 测序文件。','warn'); return; }
    const plasmid=cur();
    if(!plasmid){ setAlignStatus('请先打开或导入一个参考质粒，再进行测序比对。','warn'); return; }
    const options={cutoff:$('alignQCut')?.value||20,windowSize:$('alignWindow')?.value||20,minLen:$('alignMinLen')?.value||40};
    setAlignStatus('正在解析 AB1 并比对到当前质粒…');
    const notes=[];
    for(const file of [...input.files]){
      try{
        const read=parseAbiRead(await file.arrayBuffer(),safeName(file));
        const result=alignOneRead(read,plasmid,options);
        ALIGN_STATE.reads.push(read);
        ALIGN_STATE.results.push(result);
        ALIGN_STATE.selected=ALIGN_STATE.results.length-1;
        notes.push(`${file.name}: ${read.seq.length} bp，${result.orientation==='-'?'反向互补':'正向'}，identity ${(result.alignment.identity*100).toFixed(1)}%，差异 ${result.variants.length} 个`);
      }catch(e){
        notes.push(`${file.name}: 解析或比对失败：${e&&e.message?e.message:e}`);
      }
    }
    renderAlignmentResults();
    setAlignStatus(notes.join('\n')||'没有读取到文件。');
    input.value='';
  }

  function renderAlignmentResults(){
    const list=$('alignReadList'), summary=$('alignSummary'), out=$('alignOutput');
    if(!list||!summary||!out) return;
    if(!ALIGN_STATE.results.length){
      list.innerHTML='';
      summary.innerHTML='<div class="status">请选择 .ab1 文件；程序会比对到当前打开的质粒。</div>';
      out.innerHTML='';
      return;
    }
    list.innerHTML=ALIGN_STATE.results.map((r,i)=>`<button type="button" class="alignReadChip ${i===ALIGN_STATE.selected?'active':''}" data-align-read="${i}">${esc(r.read.name)} · ${r.orientation}</button>`).join('');
    list.querySelectorAll('[data-align-read]').forEach(btn=>btn.onclick=()=>{ALIGN_STATE.selected=parseInt(btn.dataset.alignRead);renderAlignmentResults();});
    const r=ALIGN_STATE.results[ALIGN_STATE.selected]||ALIGN_STATE.results[0];
    const aln=r.alignment;
    const strong=r.variants.filter(v=>v.confidence==='strong'||v.confidence==='medium').length;
    const weak=r.variants.length-strong;
    summary.innerHTML=`
      <div class="alignStats">
        <div class="alignStat"><b>${esc(r.read.name)}</b><br><span class="small">read：${r.read.rawLength||r.read.seq.length} bp；${r.trimmed.trimNote}</span></div>
        <div class="alignStat"><b>${r.orientation==='-'?'反向互补':'正向'}</b><br><span class="small">自动选择得分更高方向</span></div>
        <div class="alignStat"><b>${(aln.identity*100).toFixed(1)}%</b><br><span class="small">identity；score ${aln.score}</span></div>
        <div class="alignStat"><b>${aln.refStart}..${aln.refEnd}</b><br><span class="small">参考覆盖范围</span></div>
        <div class="alignStat"><b>${strong}</b><br><span class="small">中/高质量差异</span></div>
        <div class="alignStat"><b>${r.aaImpacts.length}</b><br><span class="small">CDS 氨基酸提示</span></div>
      </div>`;
    out.innerHTML=`
      <div class="alignGrid">
        <div class="alignBox"><h3>差异列表</h3><div class="alignVariantTable">${variantTable(r)}</div></div>
        <div class="alignBox"><h3>比对视图</h3><div class="alignSeq">${alignmentText(r)}</div></div>
      </div>`;
  }

  function variantTable(r){
    if(!r.variants.length) return '<div class="status ok">未发现错配、插入或缺失。</div>';
    const rows=r.variants.map((v,i)=>{
      const q=v.quality==null?'':v.quality;
      const conf=v.confidence==='weak'?'低质量疑点':(v.confidence==='strong'?'高质量':'中等质量');
      const cls=v.confidence==='weak'?'weakVar':'strongVar';
      const impact=(v.impacts||[]).join('<br>')||'';
      return `<tr><td>${i+1}</td><td>${typeLabel(v.type)}</td><td>${v.pos||''}</td><td>${esc(v.ref)}</td><td>${esc(v.read)}</td><td>${q}</td><td class="${cls}">${conf}</td><td>${esc(impact)}</td></tr>`;
    }).join('');
    return `<table><thead><tr><th>#</th><th>类型</th><th>参考位置</th><th>参考</th><th>测序</th><th>Q</th><th>证据</th><th>CDS / 氨基酸影响</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function typeLabel(t){ return t==='mismatch'?'错配':t==='ins'?'插入':t==='del'?'缺失':'N/不确定'; }

  function spanBase(base,cls,low){
    const c=cls?` ${cls}`:'';
    return `<span class="${(low?'alnLow ':'')}${c.trim()}">${esc(base)}</span>`;
  }

  function alignmentText(r){
    const a=r.alignment, q=r.orientation==='-'?r.trimmed.trimmedQuality.slice().reverse():r.trimmed.trimmedQuality;
    let html='';
    const width=80;
    for(let start=0;start<a.refAln.length;start+=width){
      const end=Math.min(a.refAln.length,start+width);
      let refLine='',midLine='',readLine='';
      for(let i=start;i<end;i++){
        const rb=a.refAln[i], qb=a.readAln[i], readPos=a.readIdx[i];
        const low=readPos&&q[readPos-1]!=null&&q[readPos-1]<20;
        let clsRef='',clsRead='',mid=' ';
        if(rb==='-'){ clsRead='alnIns'; mid='+'; }
        else if(qb==='-'){ clsRef='alnDel'; mid='-'; }
        else if(rb===qb && exactBase(rb)){ mid='|'; clsRef=clsRead='alnMatch'; }
        else{ mid='*'; clsRef=clsRead='alnMis'; }
        refLine+=spanBase(rb,clsRef,false);
        midLine+=esc(mid);
        readLine+=spanBase(qb,clsRead,low);
      }
      html+=`Ref  ${refLine}\n     ${midLine}\nRead ${readLine}\n\n`;
    }
    return html;
  }

  function exportAlignmentReport(){
    if(!ALIGN_STATE.results.length){ setAlignStatus('没有可导出的比对结果。','warn'); return; }
    const lines=['read\torientation\tidentity\tref_start\tref_end\ttype\tposition\tref\tread\tquality\tconfidence\timpact'];
    ALIGN_STATE.results.forEach(r=>{
      if(!r.variants.length){
        lines.push([r.read.name,r.orientation,(r.alignment.identity*100).toFixed(2),r.alignment.refStart,r.alignment.refEnd,'OK','','','','','',''].join('\t'));
      }else{
        r.variants.forEach(v=>lines.push([r.read.name,r.orientation,(r.alignment.identity*100).toFixed(2),r.alignment.refStart,r.alignment.refEnd,typeLabel(v.type),v.pos||'',v.ref,v.read,v.quality??'',v.confidence,(v.impacts||[]).join('; ')].join('\t')));
      }
    });
    const name=(cur()?.name||'PlasmidLab')+'_Sanger_alignment.tsv';
    download(name,lines.join('\n'),'text/tab-separated-values;charset=utf-8');
  }

  window.plabParseAb1Buffer=parseAbiRead;
  window.plabAlignSangerRead=alignOneRead;
  window.plabAlignmentState=ALIGN_STATE;
  window.plabRenderAlignmentResults=renderAlignmentResults;
  window.plabShowAlignmentView=showAlignmentView;

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installUi);
  else installUi();
})();
