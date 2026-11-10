const {findCue}=require('./core.js');
function migrate(state,lessons){
 if(state.captionRevision===3)return state;
 const next={...state,progress:{...state.progress},offsets:{...state.offsets},favorites:[]},byId=new Map(lessons.map(l=>[l.id,l]));
 const convert=(l,t)=>Math.max(l.startAt||0,Math.min(l.duration-.1,(l.oldToNew?.scale??1)*t+(l.oldToNew?.offset??0)));
 for(const [id,t] of Object.entries(next.progress)){const l=byId.get(id);if(l?.oldToNew){next.progress[id]=convert(l,t);delete next.offsets[id]}}
 for(const key of state.favorites||[]){const split=key.lastIndexOf(':'),id=key.slice(0,split),i=Number(key.slice(split+1)),l=byId.get(id);if(l?.legacyStarts&&Number.isFinite(l.legacyStarts[i])){const index=findCue(l.cues,convert(l,l.legacyStarts[i]));next.favorites.push(id+':'+index)}else next.favorites.push(key)}
 next.favorites=[...new Set(next.favorites)];next.captionRevision=3;return next;
}
module.exports={migrate};
