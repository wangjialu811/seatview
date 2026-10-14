async function aiRequest(route, payload) {
 const response=await fetch('/api/ai/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const data=await response.json();if(!response.ok)throw Error(data.error || '请求失败');return data;
}
function busy(form,value,label){const b=form.querySelector('button[type="submit"]');b.disabled=value;b.textContent=value?'处理中…':label;}
let extractSnapshot='';
let extractImageSnapshot='';
$('#openAiEntry')?.addEventListener('click',()=> $('[data-admin-tab="aiAdmin"]').click());
$('#extractForm')?.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;if(form.querySelector('button').disabled)return;
 const text=$('#rawDescription').value.trim();const selectedImage=$('#extractImage')?.files[0];if(!text && !selectedImage){$('#extractStatus').textContent='请输入观演描述或上传图片。';return;}if(selectedImage?.size>6*1024*1024){$('#extractStatus').textContent='图片不能超过 6 MB。';return;}
 busy(form,true,'AI 解析');$('#aiPreview').hidden=true;$('#savedVenueLink').hidden=true;$('#saveAiStatus').textContent='';$('#extractStatus').textContent='AI 正在解析…';
 try{const image=await fileToDataUrl(selectedImage);const result=await aiRequest('extract',{text,image});extractImageSnapshot=image;const d=result.data;const preview=$('#aiPreview');preview.reset();preview.elements.venueId.innerHTML='<option value="">请确认场馆</option>'+venues.map(v=>`<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`).join('');preview.elements.venueId.value=venues.find(v=>v.name===d.venueName)?.id || '';for(const k of ['section','row','seatNo','summary'])preview.elements[k].value=d[k]||'';for(const k of Object.keys(SeatViewFields.options))SeatViewFields.fillField(preview,k,d[k]);preview.elements.tags.value=(d.tags||[]).join(', ');$('#aiConfidence').textContent=`解析置信度：${Math.round(d.confidence*100)}%（仅作参考，不确定字段请人工补充）`;extractSnapshot=text;preview.hidden=false;$('#extractStatus').textContent=result.warning || '解析完成，请人工核对。';}
 catch{$('#extractStatus').textContent='AI 解析失败，请稍后重试。也可以通过视角记录管理手动录入。';}finally{busy(form,false,'AI 解析');}
});
$('#aiPreview')?.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;if(form.querySelector('button').disabled)return;busy(form,true,'确认保存');$('#saveAiStatus').textContent='正在保存…';
 try{const data=new FormData(form);const payload=Object.fromEntries(['venueId','section','row','seatNo','stageDistance','viewingAngle','obstruction','shootingFriendly','summary','source'].map(k=>[k,data.get(k)||null]));payload.tags=String(data.get('tags')).split(/[,，]/).map(t=>t.trim()).filter(Boolean);payload.image=await fileToDataUrl(data.get('image')) || extractImageSnapshot;payload.rawDescription=extractSnapshot;await aiRequest('records',payload);await loadServerState();renderAll();$('#saveAiStatus').textContent='保存成功，已发布到前台。';const link=$('#savedVenueLink');link.href='/?venue='+encodeURIComponent(payload.venueId)+'#viewer';link.hidden=false;form.hidden=true;}
 catch(error){$('#saveAiStatus').textContent='保存失败：'+error.message;}finally{busy(form,false,'确认保存');}
});
$('#recommendForm')?.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;if(form.querySelector('button').disabled)return;const text=$('#recommendText').value.trim();if(!text){$('#recommendStatus').textContent='请先输入选座需求。';return;}
 const venueId=selectedVenueId;const requestEpoch=recommendationEpoch;busy(form,true,'帮我选座');$('#recommendResult').replaceChildren();if($('#recommendationSection'))$('#recommendationSection').hidden=true;if($('#viewRecommendation'))$('#viewRecommendation').hidden=true;$('#recommendStatus').textContent='正在读取座区数据并比较需求…';
 try{const result=await aiRequest('recommend',{text,venueId});if(selectedVenueId!==venueId || requestEpoch!==recommendationEpoch)return;const d=result.data;const card=(r,title)=>`<article class="recommend-card"><h4>${title} · ${escapeHtml(r.section)}</h4><p>推荐指数：${'★'.repeat(r.score)}${'☆'.repeat(5-r.score)}</p><strong>推荐理由（已有字段）</strong><ul>${r.reasons.map(x=>`<li>${escapeHtml(x)}</li>`).join('') || '<li>结构化信息不足，请结合原始评价判断。</li>'}</ul><strong>不足 / 风险</strong><ul>${r.disadvantages.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><p>依据来源：${escapeHtml(r.source)}</p><button type="button" data-recommended-section="${escapeHtml(r.sectionId)}">查看该座区视角</button></article>`;
 $('#recommendResult').innerHTML=(d.primary?card(d.primary,'首选推荐'):'')+d.alternatives.map(r=>card(r,'备选推荐')).join('')+`<p class="demo-note">${escapeHtml(d.notice)}</p>`;$('#recommendStatus').textContent=result.warning || '已基于当前场馆数据完成推荐。';if($('#recommendationSection')){$('#recommendationSection').hidden=false;$('#viewRecommendation').hidden=false;$('#recommendationSection').scrollIntoView({block:'start',behavior:'smooth'});}}
 catch{if(requestEpoch===recommendationEpoch)$('#recommendStatus').textContent='AI 推荐失败，请稍后重试。';}finally{busy(form,false,'帮我选座');}
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-recommended-section]');if(!b)return;selectedSectionId=b.dataset.recommendedSection;recordFilter={section:'',row:'',seat:''};showAllVenueRecords=false;renderSeatMap();renderDetail();$('#frontRecordList').scrollIntoView({behavior:'smooth'});});
window.addEventListener('focus',async()=>{if(isFrontPage){const id=selectedVenueId;await loadServerState();if(venues.some(v=>v.id===id))selectedVenueId=id;renderAll();}});

// Preserve existing forms while preventing duplicate asynchronous submissions.
for (const form of document.querySelectorAll('#venueForm,#seatMapForm,#sectionForm,#recordForm')) {
 form.addEventListener('submit', e=>{if(form.dataset.saving){e.stopImmediatePropagation();e.preventDefault();return;}form.dataset.saving='1';form.querySelector('button[type="submit"]').disabled=true;},true);
}
const originalSaveState=saveState;
saveState=async function(){try{return await originalSaveState();}finally{for(const f of document.querySelectorAll('[data-saving]')){delete f.dataset.saving;f.querySelector('button[type="submit"]').disabled=false;}}};
