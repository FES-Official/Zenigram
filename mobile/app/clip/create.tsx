 import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, Switch, Text, TextInput, View, type GestureResponderEvent } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { deleteUploadedMedia, uploadPickedImage, uploadPickedVideo, type UploadedImage, type UploadedVideo } from "@/lib/nativeUpload";
import { colors } from "@/theme/colors";

const MAX_ITEMS = 10;
const MAX_DURATION = 120;
const MIN_SEGMENT = 0.5;
const TOPICS = [
  ["technology","Technology"],["education","Education"],["gaming","Gaming"],["travel","Travel"],
  ["sports","Sports"],["art","Art & Design"],["food","Food"],["fashion","Fashion"],
  ["news","News"],["entertainment","Entertainment"],["fitness","Fitness"],
] as const;
const FILTERS = [
  {id:"none",label:"Original",tint:"transparent"},
  {id:"cinema",label:"Cinema",tint:"rgba(14,8,12,0.18)"},
  {id:"warm",label:"Warm",tint:"rgba(212,112,40,0.20)"},
  {id:"cool",label:"Cool",tint:"rgba(35,90,170,0.18)"},
  {id:"mono",label:"Mono",tint:"rgba(80,80,80,0.38)"},
] as const;
const TRANSITIONS = [
  {id:"cut",label:"Cut",icon:"content-cut"},
  {id:"fade",label:"Fade",icon:"circle-half-full"},
  {id:"slide",label:"Slide",icon:"arrow-right"},
  {id:"zoom",label:"Zoom",icon:"magnify-plus-outline"},
] as const;

type MediaKind = "image" | "video";
type FilterId = (typeof FILTERS)[number]["id"];
type TransitionId = (typeof TRANSITIONS)[number]["id"];
type Asset = {
  id:string; source:ImagePicker.ImagePickerAsset; uri:string; name:string; type:MediaKind;
  sourceDuration:number; duration:number; trimStart:number; filter:FilterId;
};
type Entry = Asset & {index:number;start:number;end:number};
type TextLayer = {
  id:string;text:string;start:number;end:number;x:number;y:number;size:number;color:string;
  background:boolean;backgroundColor:string;showBorder:boolean;borderColor:string;borderWidth:number;
  rotation:number;fontFamily:string;fontWeight:400|700;italic:boolean;underline:boolean;strike:boolean;
};

const uid=()=>Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,9);
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
const timeLabel=(v:number)=>{const s=Math.max(0,Math.floor(v));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");};

function RangeControl({label,value,min,max,step=0.1,suffix="",onChange}:{
  label:string;value:number;min:number;max:number;step?:number;suffix?:string;onChange:(v:number)=>void;
}) {
  const [width,setWidth]=useState(1);
  const upper=Math.max(min,max),safe=clamp(value,min,upper);
  const pct=upper===min?0:((safe-min)/(upper-min))*100;
  const update=(event:GestureResponderEvent)=>{
    const ratio=clamp(event.nativeEvent.locationX/Math.max(width,1),0,1);
    const raw=min+ratio*(upper-min);
    onChange(Number(clamp(Math.round(raw/step)*step,min,upper).toFixed(2)));
  };
  return <View className="mt-3">
    <View className="mb-2 flex-row justify-between"><Text className="text-xs font-semibold" style={{color:colors.muted}}>{label}</Text><Text className="text-xs font-bold" style={{color:colors.rose}}>{safe.toFixed(step<1?1:0)}{suffix}</Text></View>
    <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} onStartShouldSetResponder={()=>true} onMoveShouldSetResponder={()=>true} onResponderGrant={update} onResponderMove={update} accessibilityRole="adjustable" accessibilityLabel={label} style={{height:28,justifyContent:"center"}}>
      <View className="h-2 overflow-hidden rounded-full" style={{backgroundColor:colors.surface}}><View className="h-2 rounded-full" style={{width:(pct+"%") as `${number}%`,backgroundColor:colors.crimson}}/></View>
      <View className="absolute h-5 w-5 rounded-full border-2" style={{left:Math.max(0,Math.min(width-20,pct/100*width-10)),backgroundColor:colors.rose,borderColor:colors.background}}/>
    </View>
  </View>;
}

export default function CreateClipScreen() {
  const [assets,setAssets]=useState<Asset[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [caption,setCaption]=useState("");
  const [topics,setTopics]=useState<string[]>([]);
  const [closeOnesOnly,setCloseOnesOnly]=useState(false);
  const [transition,setTransition]=useState<TransitionId>("fade");
  const [textLayers,setTextLayers]=useState<TextLayer[]>([]);
  const [selectedTextId,setSelectedTextId]=useState<string|null>(null);
  const [playhead,setPlayhead]=useState(0);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [error,setError]=useState("");
  const timeline=useMemo<Entry[]>(()=>{
    let cursor=0;
    return assets.map((asset,index)=>{const item={...asset,index,start:cursor,end:cursor+asset.duration};cursor=item.end;return item;});
  },[assets]);
  const totalDuration=timeline.reduce((sum,item)=>sum+item.duration,0);
  const selected=assets.find(item=>item.id===selectedId)||assets[0]||null;
  const activeEntry=timeline.find(item=>playhead>=item.start&&playhead<item.end)||timeline[timeline.length-1]||null;
  const previewAsset=activeEntry;
  const previewFilter=FILTERS.find(item=>item.id===previewAsset?.filter)||FILTERS[0];
  const selectedText=textLayers.find(item=>item.id===selectedTextId)||null;
  const player=useVideoPlayer(null,p=>{p.loop=false;p.muted=true;});

  useEffect(() => {
  if (activeEntry?.type !== "video") {
    player.pause();
    player.replace(null);
    return;
  }

  player.timeUpdateEventInterval = 0.12;

  const loadSubscription = player.addListener("sourceLoad", () => {
    player.seekBy(activeEntry.trimStart - player.currentTime);
    player.play();
  });

  const timeSubscription = player.addListener("timeUpdate", event => {
    const segmentEnd = activeEntry.trimStart + activeEntry.duration;
    if (event.currentTime >= segmentEnd) {
      player.pause();
      player.seekBy(activeEntry.trimStart - event.currentTime);
    }
  });

  player.replace(activeEntry.uri);

  return () => {
    loadSubscription.remove();
    timeSubscription.remove();
  };
}, [
  player,
  activeEntry?.id,
  activeEntry?.type,
  activeEntry?.uri,
  activeEntry?.trimStart,
  activeEntry?.duration,
]);

  function addAssets(chosen:ImagePicker.ImagePickerAsset[]) {
    const remaining=Math.max(0,MAX_ITEMS-assets.length);
    const additions:Asset[]=chosen.slice(0,remaining).flatMap(source=>{
      const type:MediaKind=source.type==="video"?"video":"image";
      const sourceDuration=type==="video"?Number(source.duration||0)/1000:60;
      if(type==="video"&&(!Number.isFinite(sourceDuration)||sourceDuration<MIN_SEGMENT))return [];
      return [{id:uid(),source,uri:source.uri,name:source.fileName||(type==="video"?"Video":"Photo"),type,
        sourceDuration,duration:type==="video"?Math.min(15,sourceDuration):3,trimStart:0,filter:"none"}];
    });
    if(additions.length){setAssets(old=>[...old,...additions]);setSelectedId(additions[0].id);setError("");}
    if(chosen.length>remaining)setError("A clip can contain up to 10 media segments.");
  }

  async function pickMedia(){
    if(busy||assets.length>=MAX_ITEMS)return;
    setError("");
    try{
      const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
      if(!permission.granted){setError("Allow photo and video library access in your device settings.");return;}
      const result=await ImagePicker.launchImageLibraryAsync({
        mediaTypes:["images","videos"],allowsMultipleSelection:true,selectionLimit:MAX_ITEMS-assets.length,
        orderedSelection:true,videoMaxDuration:120,videoExportPreset:ImagePicker.VideoExportPreset.Passthrough,quality:1,exif:false,
      });
      if(!result.canceled)addAssets(result.assets);
    }catch(e){setError(getApiErrorMessage(e));}
  }

  function updateAsset(id:string,changes:Partial<Asset>){
    setAssets(old=>old.map(item=>item.id===id?{...item,...changes}:item));
  }
  function selectAsset(item:Asset){
    setSelectedId(item.id);setPlayhead(timeline.find(entry=>entry.id===item.id)?.start||0);
  }
  function removeAsset(id:string){
    const next=assets.filter(item=>item.id!==id);setAssets(next);setSelectedId(next[0]?.id||null);setPlayhead(0);
  }
  function moveAsset(index:number,direction:-1|1){
    const target=index+direction;if(target<0||target>=assets.length)return;
    setAssets(old=>{const next=[...old];const [item]=next.splice(index,1);next.splice(target,0,item);return next;});
  }
  function addText(){
    if(!totalDuration)return;
    const start=activeEntry?.start??0,end=activeEntry?.end??Math.min(totalDuration,3);
    const layer:TextLayer={id:uid(),text:"Your text",start,end:Math.max(start+MIN_SEGMENT,end),x:50,y:72,size:32,color:"#ffffff",
      background:true,backgroundColor:"#000000",showBorder:false,borderColor:"#ffffff",borderWidth:2,
      rotation:0,fontFamily:"Arial",fontWeight:700,italic:false,underline:false,strike:false};
    setTextLayers(old=>[...old,layer].slice(0,12));setSelectedTextId(layer.id);
  }
  function updateText(id:string,changes:Partial<TextLayer>){
    setTextLayers(old=>old.map(layer=>layer.id===id?{...layer,...changes}:layer));
  }
  function toggleTopic(id:string){
    setTopics(old=>old.includes(id)?old.filter(t=>t!==id):old.length<5?[...old,id]:old);
  }

  async function publish(){
    if(busy)return;
    if(!assets.length){setError("Add at least one photo or video to your clip.");return;}
    if(totalDuration<1||totalDuration>MAX_DURATION){setError("The complete clip must be between 1 second and 2 minutes.");return;}
    setBusy(true);setProgress(0);setError("");
    const uploaded:Array<UploadedImage|UploadedVideo>=[];
    try{
      for(let i=0;i<assets.length;i++){
        const item=assets[i];
        const report=(p:number)=>setProgress(Math.min(99,Math.round(((i+p/100)/assets.length)*100)));
        const media=item.type==="video"?await uploadPickedVideo(item.source,report):await uploadPickedImage(item.source,report);
        uploaded.push(media);
      }
      const mediaTimeline=timeline.map(item=>({duration:Number(item.duration.toFixed(2)),trimStart:Number(item.trimStart.toFixed(2)),filter:item.filter}));
      const {data}=await api.post("/api/clips",{
        caption:caption.trim().slice(0,500),topics,mediaItems:uploaded,timeline:mediaTimeline,
        textLayers:textLayers.map(layer=>({...layer,text:layer.text.slice(0,180),start:clamp(layer.start,0,totalDuration),end:clamp(layer.end,0,totalDuration)})),
        transition,closeOnesOnly,
      });
      const clipId=String(data?.clip?._id||"");
      if(!data?.success||!clipId)throw new Error("Zenigram did not confirm clip creation.");
      setProgress(100);
      if(data.renderStatus==="queued"||data.renderStatus==="rendering"||data.clip?.renderStatus==="queued"||data.clip?.renderStatus==="rendering"){
        router.replace("/clip/rendering/"+encodeURIComponent(clipId));
      }else{
        router.replace("/(tabs)/clips");
      }
    }catch(e){
      if(uploaded.length)await deleteUploadedMedia(uploaded.map(item=>item.key)).catch(()=>{});
      setError(getApiErrorMessage(e));
    }finally{setBusy(false);}
  }

  const visibleText=textLayers.filter(layer=>playhead>=layer.start&&playhead<=layer.end);

  return <Screen>
    <View className="mb-5 flex-row items-center">
      <Pressable onPress={()=>router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{borderColor:colors.line,backgroundColor:colors.panel}}>
        <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text}/>
      </Pressable>
      <View className="flex-1"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.rose}}>ZENIGRAM STUDIO</Text><Text className="mt-1 text-2xl font-black" style={{color:colors.text}}>Create a clip</Text></View>
      <View className="rounded-xl px-3 py-2" style={{backgroundColor:colors.wine}}><Text className="text-xs font-black" style={{color:colors.rose}}>{timeLabel(totalDuration)} / 2:00</Text></View>
    </View>
    <Text className="mb-4 text-sm leading-6" style={{color:colors.muted}}>Combine photos and videos, arrange scenes, trim video segments, add timed text, apply filters and choose scene transitions.</Text>
    {error?<View className="mb-4 rounded-2xl border p-3" style={{backgroundColor:colors.panel,borderColor:colors.danger}}><Text className="text-sm leading-5" style={{color:colors.danger}}>{error}</Text></View>:null}

    {previewAsset?<View className="mb-4 overflow-hidden rounded-3xl" style={{height:390,backgroundColor:"#080508"}}>
      {previewAsset.type==="video"?<VideoView player={player} contentFit="contain" nativeControls style={{width:"100%",height:"100%"}}/>:<Image source={{uri:previewAsset.uri}} resizeMode="contain" className="h-full w-full"/>}
      <View pointerEvents="none" className="absolute inset-0" style={{backgroundColor:previewFilter.tint}}/>
      {visibleText.map(layer=><View key={layer.id} pointerEvents="none" className="absolute max-w-[90%] rounded-lg px-2 py-1" style={{
        left:(layer.x+"%") as `${number}%`,top:(layer.y+"%") as `${number}%`,backgroundColor:layer.background?layer.backgroundColor+"CC":"transparent",
        borderWidth:layer.showBorder?layer.borderWidth:0,borderColor:layer.borderColor,transform:[{rotate:layer.rotation+"deg"}],
      }}>
        <Text style={{color:layer.color,fontSize:layer.size,fontFamily:layer.fontFamily,fontWeight:layer.fontWeight===700?"700":"400",
          fontStyle:layer.italic?"italic":"normal",textDecorationLine:layer.underline&&layer.strike?"underline line-through":layer.underline?"underline":layer.strike?"line-through":"none"}}>{layer.text}</Text>
      </View>)}
    </View>:<Pressable onPress={()=>void pickMedia()} className="mb-4 items-center justify-center rounded-3xl border border-dashed px-6 py-12" style={{borderColor:colors.line,backgroundColor:colors.panel}}>
      <MaterialCommunityIcons name="movie-plus-outline" size={46} color={colors.rose}/><Text className="mt-3 text-lg font-bold" style={{color:colors.text}}>Add photos or videos</Text><Text className="mt-2 text-center text-xs" style={{color:colors.muted}}>Up to 10 scenes · 2 minutes total</Text>
    </Pressable>}

    <View className="mb-5 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <View className="mb-3 flex-row items-center justify-between"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Timeline · {assets.length} scenes</Text>
        <Pressable onPress={()=>void pickMedia()} disabled={busy||assets.length>=MAX_ITEMS} className="flex-row items-center rounded-xl px-3 py-2" style={{backgroundColor:colors.wine,opacity:assets.length>=MAX_ITEMS?0.4:1}}><MaterialCommunityIcons name="plus" size={17} color={colors.rose}/><Text className="ml-1 text-xs font-bold" style={{color:colors.rose}}>Add media</Text></Pressable>
      </View>
      {timeline.length?<View className="flex-row flex-wrap">{timeline.map((item,index)=>{
        const active=selected?.id===item.id;
        return <Pressable key={item.id} onPress={()=>selectAsset(item)} className="mb-2 mr-2 rounded-xl border px-3 py-2" style={{borderColor:active?colors.rose:colors.line,backgroundColor:active?colors.wine:colors.surface}}>
          <Text className="text-xs font-bold" style={{color:active?colors.rose:colors.text}}>{index+1}. {item.type==="video"?"Video":"Photo"} · {item.duration.toFixed(1)}s</Text>
          <View className="mt-2 flex-row items-center">
            <Pressable onPress={()=>moveAsset(index,-1)} disabled={busy||index===0} className="mr-3" accessibilityLabel="Move scene earlier"><MaterialCommunityIcons name="chevron-left" size={18} color={index===0?colors.muted:colors.rose}/></Pressable>
            <Pressable onPress={()=>moveAsset(index,1)} disabled={busy||index===assets.length-1} className="mr-3" accessibilityLabel="Move scene later"><MaterialCommunityIcons name="chevron-right" size={18} color={index===assets.length-1?colors.muted:colors.rose}/></Pressable>
            <Pressable onPress={()=>removeAsset(item.id)} disabled={busy} accessibilityLabel="Remove scene"><MaterialCommunityIcons name="close-circle-outline" size={18} color={colors.danger}/></Pressable>
          </View>
        </Pressable>;
      })}</View>:<Text className="text-xs leading-5" style={{color:colors.muted}}>Your scenes appear here in playback order.</Text>}
      {totalDuration>0?<><RangeControl label={"Playhead · "+timeLabel(playhead)} value={playhead} min={0} max={Math.max(0.5,totalDuration)} step={0.1} onChange={setPlayhead}/><View className="mt-1 flex-row justify-between"><Text className="text-[10px]" style={{color:colors.muted}}>Start</Text><Text className="text-[10px]" style={{color:colors.muted}}>End · {timeLabel(totalDuration)}</Text></View></>:null}
    </View>

    {selected?<View className="mb-5 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <View className="mb-2 flex-row items-center justify-between"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Scene controls</Text><Text numberOfLines={1} className="ml-3 flex-1 text-right text-xs" style={{color:colors.muted}}>{selected.name}</Text></View>
      {selected.type==="video"?<>
        <RangeControl label="Trim start" value={selected.trimStart} min={0} max={Math.max(0,selected.sourceDuration-MIN_SEGMENT)} step={0.1} suffix="s" onChange={value=>updateAsset(selected.id,{trimStart:value,duration:Math.min(selected.duration,Math.max(MIN_SEGMENT,selected.sourceDuration-value))})}/>
        <RangeControl label="Clip length" value={selected.duration} min={MIN_SEGMENT} max={Math.max(MIN_SEGMENT,selected.sourceDuration-selected.trimStart)} step={0.1} suffix="s" onChange={value=>updateAsset(selected.id,{duration:value})}/>
        <Text className="mt-1 text-[11px] leading-5" style={{color:colors.muted}}>Preview loops only the selected source interval: {selected.trimStart.toFixed(1)}s – {(selected.trimStart+selected.duration).toFixed(1)}s. The original upload is preserved; the server stores trim points as non-destructive timeline metadata.</Text>
      </>:<RangeControl label="Photo duration" value={selected.duration} min={0.5} max={15} step={0.5} suffix="s" onChange={value=>updateAsset(selected.id,{duration:value})}/>}
      <Text className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Filter</Text>
      <View className="flex-row flex-wrap">{FILTERS.map(item=><Pressable key={item.id} onPress={()=>updateAsset(selected.id,{filter:item.id})} disabled={busy} className="mb-2 mr-2 rounded-xl border px-3 py-2" style={{borderColor:selected.filter===item.id?colors.rose:colors.line,backgroundColor:selected.filter===item.id?colors.wine:colors.surface}}><Text className="text-xs font-semibold" style={{color:selected.filter===item.id?colors.rose:colors.muted}}>{item.label}</Text></Pressable>)}</View>
    </View>:null}

    <View className="mb-5 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <View className="mb-3 flex-row items-center justify-between"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Text overlays · {textLayers.length}/12</Text>
        <Pressable onPress={addText} disabled={busy||!assets.length||textLayers.length>=12} className="flex-row items-center rounded-xl px-3 py-2" style={{backgroundColor:colors.wine,opacity:!assets.length||textLayers.length>=12?0.45:1}}><MaterialCommunityIcons name="format-text" size={17} color={colors.rose}/><Text className="ml-1 text-xs font-bold" style={{color:colors.rose}}>Add text</Text></Pressable>
      </View>
      <View className="mb-3 flex-row flex-wrap">{textLayers.map(layer=><Pressable key={layer.id} onPress={()=>setSelectedTextId(layer.id)} className="mb-2 mr-2 rounded-full border px-3 py-2" style={{borderColor:selectedTextId===layer.id?colors.rose:colors.line,backgroundColor:selectedTextId===layer.id?colors.wine:colors.surface}}><Text numberOfLines={1} className="text-xs font-semibold" style={{color:selectedTextId===layer.id?colors.rose:colors.muted}}>{layer.text||"Text layer"}</Text></Pressable>)}</View>
      {selectedText?<View>
        <TextInput value={selectedText.text} onChangeText={value=>updateText(selectedText.id,{text:value.slice(0,180)})} placeholder="Write overlay text..." placeholderTextColor={colors.muted} multiline maxLength={180} className="min-h-20 rounded-2xl border p-3 text-sm" style={{backgroundColor:colors.surface,borderColor:colors.line,color:colors.text}}/>
        <RangeControl label="Show from" value={selectedText.start} min={0} max={Math.max(0.5,totalDuration)} step={0.1} suffix="s" onChange={value=>updateText(selectedText.id,{start:value,end:Math.max(value+0.5,selectedText.end)})}/>
        <RangeControl label="Show until" value={selectedText.end} min={Math.min(totalDuration,selectedText.start+0.5)} max={Math.max(0.5,totalDuration)} step={0.1} suffix="s" onChange={value=>updateText(selectedText.id,{end:value})}/>
        <RangeControl label="Text size" value={selectedText.size} min={14} max={72} step={1} suffix="px" onChange={value=>updateText(selectedText.id,{size:value})}/>
        <RangeControl label="Horizontal position" value={selectedText.x} min={0} max={90} step={1} suffix="%" onChange={value=>updateText(selectedText.id,{x:value})}/>
        <RangeControl label="Vertical position" value={selectedText.y} min={0} max={90} step={1} suffix="%" onChange={value=>updateText(selectedText.id,{y:value})}/>
        <View className="mt-3 flex-row flex-wrap">{["#ffffff","#ff7892","#ffd166","#8be9fd","#111111"].map(color=><Pressable key={color} onPress={()=>updateText(selectedText.id,{color})} className="mr-3 h-8 w-8 rounded-full border-2" style={{backgroundColor:color,borderColor:selectedText.color===color?colors.rose:colors.line}} accessibilityLabel={"Set text color "+color}/>)}
          <Pressable onPress={()=>updateText(selectedText.id,{background:!selectedText.background})} className="rounded-full border px-3 py-2" style={{borderColor:colors.line}}><Text className="text-xs font-semibold" style={{color:colors.rose}}>{selectedText.background?"Hide background":"Show background"}</Text></Pressable>
          <Pressable onPress={()=>updateText(selectedText.id,{italic:!selectedText.italic})} className="ml-2 rounded-full border px-3 py-2" style={{borderColor:colors.line}}><Text className="text-xs font-semibold italic" style={{color:colors.rose}}>Italic</Text></Pressable>
          <Pressable onPress={()=>setTextLayers(old=>old.filter(item=>item.id!==selectedText.id))} className="ml-2 rounded-full border px-3 py-2" style={{borderColor:colors.danger}}><Text className="text-xs font-semibold" style={{color:colors.danger}}>Delete</Text></Pressable>
        </View>
      </View>:<Text className="text-xs leading-5" style={{color:colors.muted}}>Create captions that appear only during the time range you set.</Text>}
    </View>

    <View className="mb-5 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Scene transitions</Text>
      <View className="flex-row flex-wrap">{TRANSITIONS.map(item=><Pressable key={item.id} onPress={()=>setTransition(item.id)} disabled={busy} className="mb-2 mr-2 flex-row items-center rounded-xl border px-3 py-3" style={{borderColor:transition===item.id?colors.rose:colors.line,backgroundColor:transition===item.id?colors.wine:colors.surface}}><MaterialCommunityIcons name={item.icon as never} size={16} color={transition===item.id?colors.rose:colors.muted}/><Text className="ml-2 text-xs font-bold" style={{color:transition===item.id?colors.rose:colors.muted}}>{item.label}</Text></Pressable>)}</View>
      <Text className="mt-1 text-[11px] leading-5" style={{color:colors.muted}}>Transition metadata is saved with the clip. Uploaded video files are not re-encoded by this editor.</Text>
    </View>

    <View className="mb-5 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Caption</Text>
      <TextInput value={caption} onChangeText={value=>setCaption(value.slice(0,500))} placeholder="Add a caption to your clip..." placeholderTextColor={colors.muted} multiline maxLength={500} textAlignVertical="top" className="min-h-20 text-sm leading-6" style={{color:colors.text}}/>
      <Text className="mt-2 self-end text-xs" style={{color:colors.muted}}>{caption.length}/500</Text>
    </View>

    <View className="mb-5"><View className="mb-3 flex-row items-center justify-between"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Topics · optional</Text><Text className="text-xs" style={{color:colors.muted}}>{topics.length}/5 selected</Text></View>
      <View className="flex-row flex-wrap">{TOPICS.map(([id,label])=>{const active=topics.includes(id);return <Pressable key={id} disabled={busy||(!active&&topics.length>=5)} onPress={()=>toggleTopic(id)} className="mb-2 mr-2 rounded-full border px-3 py-2" style={{borderColor:active?colors.crimson:colors.line,backgroundColor:active?colors.wine:colors.panel}}><Text className="text-xs font-semibold" style={{color:active?colors.rose:colors.muted}}>{label}</Text></Pressable>;})}</View>
    </View>

    <View className="mb-6 flex-row items-center justify-between rounded-2xl border p-4" style={{borderColor:colors.line,backgroundColor:colors.panel}}>
      <View className="flex-1 pr-3"><Text className="text-sm font-bold" style={{color:colors.text}}>Close Ones audience</Text><Text className="mt-1 text-xs leading-5" style={{color:colors.muted}}>Limit this clip to your Close Ones.</Text></View>
      <Switch value={closeOnesOnly} onValueChange={setCloseOnesOnly} disabled={busy} trackColor={{false:colors.surface,true:colors.crimson}} thumbColor={closeOnesOnly?colors.rose:colors.muted}/>
    </View>

    {busy?<View className="mb-3"><View className="mb-2 flex-row justify-between"><Text className="text-xs font-semibold" style={{color:colors.rose}}>Uploading media securely</Text><Text className="text-xs font-bold" style={{color:colors.text}}>{progress}%</Text></View><View className="h-2 overflow-hidden rounded-full" style={{backgroundColor:colors.surface}}><View className="h-2 rounded-full" style={{width:(progress+"%") as `${number}%`,backgroundColor:colors.crimson}}/></View></View>:null}
    <Pressable onPress={()=>void publish()} disabled={busy||!assets.length||totalDuration<1||totalDuration>MAX_DURATION} className="mb-8 flex-row items-center justify-center rounded-2xl px-4 py-4" style={{backgroundColor:colors.rose,opacity:busy||!assets.length||totalDuration<1||totalDuration>MAX_DURATION?0.5:1}}>
      {busy?<ActivityIndicator color={colors.background}/>:<MaterialCommunityIcons name="send" size={19} color={colors.background}/>}<Text className="ml-2 text-base font-bold" style={{color:colors.background}}>{busy?"Publishing...":"Publish clip"}</Text>
    </Pressable>
  </Screen>;
}
