import { useRef, useState } from "react";
import {
  ActivityIndicator, Image, Pressable, ScrollView, Switch, Text, TextInput, View,
  type GestureResponderEvent, type LayoutChangeEvent,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { deleteUploadedMedia, uploadLocalImage, type UploadedImage } from "@/lib/nativeUpload";
import { colors } from "@/theme/colors";

const MAX_IMAGES = 6;
const MAX_TEXT = 8;
const FILTERS = [
  {id:"none",label:"Original",tint:"transparent"},
  {id:"oslo",label:"Oslo",tint:"rgba(255,218,190,0.16)"},
  {id:"tokyo",label:"Tokyo",tint:"rgba(255,80,115,0.14)"},
  {id:"rio",label:"Rio",tint:"rgba(35,165,130,0.16)"},
  {id:"mono",label:"Mono",tint:"rgba(30,30,30,0.46)"},
] as const;
const LAYOUTS = [
  {id:"one",label:"Full frame",icon:"image-outline"},
  {id:"split",label:"Horizontal split",icon:"view-column-outline"},
  {id:"duo",label:"Duo",icon:"view-column"},
  {id:"hero",label:"Hero",icon:"view-dashboard-outline"},
  {id:"columns",label:"Columns",icon:"view-column"},
  {id:"quad",label:"Grid",icon:"view-grid-outline"},
  {id:"mosaic",label:"Mosaic",icon:"collage"},
  {id:"six",label:"Six",icon:"view-grid"},
] as const;
const BACKGROUNDS = [
  {id:"black-cherry",label:"Black cherry",color:"#16070D"},
  {id:"crimson",label:"Crimson",color:"#64101F"},
  {id:"burgundy",label:"Burgundy",color:"#4A1028"},
  {id:"ember",label:"Ember",color:"#542014"},
  {id:"ruby",label:"Ruby",color:"#741B38"},
  {id:"wine",label:"Wine",color:"#32102D"},
] as const;
const STORY_CELLS: Record<string,Array<{x:number;y:number;w:number;h:number}>> = {
  one:[{x:0,y:0,w:100,h:100}],
  split:[{x:0,y:0,w:100,h:50},{x:0,y:50,w:100,h:50}],
  duo:[{x:0,y:0,w:50,h:100},{x:50,y:0,w:50,h:100}],
  hero:[{x:0,y:0,w:100,h:62},{x:0,y:62,w:50,h:38},{x:50,y:62,w:50,h:38}],
  columns:[{x:0,y:0,w:33.34,h:100},{x:33.34,y:0,w:33.33,h:100},{x:66.67,y:0,w:33.33,h:100}],
  quad:[{x:0,y:0,w:50,h:50},{x:50,y:0,w:50,h:50},{x:0,y:50,w:50,h:50},{x:50,y:50,w:50,h:50}],
  mosaic:[{x:0,y:0,w:62,h:62},{x:62,y:0,w:38,h:31},{x:62,y:31,w:38,h:31},{x:0,y:62,w:50,h:38},{x:50,y:62,w:50,h:38}],
  six:Array.from({length:6},(_,index)=>({x:(index%2)*50,y:Math.floor(index/2)*(100/3),w:50,h:100/3})),
};
const BRUSH_COLORS = ["#FFFFFF","#FF7892","#FFD166","#8BE9FD","#111111"];

type StoryText = {id:string;value:string;x:number;y:number;size:number;color:string;background:boolean;backgroundColor:string;italic:boolean};
type Point = {x:number;y:number};

function makeId(){return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);}
function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,value));}

function StoryRange({label,value,min,max,onChange}:{
  label:string;value:number;min:number;max:number;onChange:(value:number)=>void;
}) {
  const [width,setWidth]=useState(1);
  const percent=max===min?0:((value-min)/(max-min))*100;
  function update(event:GestureResponderEvent){
    const ratio=clamp(event.nativeEvent.locationX/Math.max(1,width),0,1);
    onChange(Math.round(min+ratio*(max-min)));
  }
  return <View className="mt-3">
    <View className="mb-2 flex-row justify-between"><Text className="text-xs font-semibold" style={{color:colors.muted}}>{label}</Text><Text className="text-xs font-bold" style={{color:colors.rose}}>{value}</Text></View>
    <View onLayout={event=>setWidth(event.nativeEvent.layout.width)} onStartShouldSetResponder={()=>true} onMoveShouldSetResponder={()=>true} onResponderGrant={update} onResponderMove={update} accessibilityRole="adjustable" accessibilityLabel={label} style={{height:28,justifyContent:"center"}}>
      <View className="h-2 overflow-hidden rounded-full" style={{backgroundColor:colors.surface}}><View className="h-2 rounded-full" style={{width:(percent+"%") as `${number}%`,backgroundColor:colors.crimson}}/></View>
      <View className="absolute h-5 w-5 rounded-full border-2" style={{left:Math.max(0,Math.min(width-20,(percent/100)*width-10)),backgroundColor:colors.rose,borderColor:colors.background}}/>
    </View>
  </View>;
}

export default function CreateStoryScreen() {
  const previewRef=useRef<View>(null);
  const stageSize=useRef({width:360,height:640});
  const [assets,setAssets]=useState<ImagePicker.ImagePickerAsset[]>([]);
  const [layout,setLayout]=useState<(typeof LAYOUTS)[number]["id"]>("one");
  const [background,setBackground]=useState<(typeof BACKGROUNDS)[number]["id"]>("black-cherry");
  const [gap,setGap]=useState(3);
  const [cornerRadius,setCornerRadius]=useState(12);
  const [filter,setFilter]=useState<(typeof FILTERS)[number]["id"]>("none");
  const [caption,setCaption]=useState("");
  const [duration,setDuration]=useState(15);
  const [texts,setTexts]=useState<StoryText[]>([]);
  const [selectedTextId,setSelectedTextId]=useState<string|null>(null);
  const [drawing,setDrawing]=useState(false);
  const [brushColor,setBrushColor]=useState("#FFFFFF");
  const [brushSize,setBrushSize]=useState(5);
  const [strokes,setStrokes]=useState<Array<{d:string;color:string;width:number}>>([]);
  const [activeStroke,setActiveStroke]=useState("");
  const [location,setLocation]=useState<{lat:number;lng:number}|null>(null);
  const [locationBusy,setLocationBusy]=useState(false);
  const [publishing,setPublishing]=useState(false);
  const [progress,setProgress]=useState(0);
  const [error,setError]=useState("");

  const selectedText=texts.find(item=>item.id===selectedTextId)||null;
  const activeFilter=FILTERS.find(item=>item.id===filter)||FILTERS[0];

  function addAssets(next:ImagePicker.ImagePickerAsset[]){
    const nextCount=Math.min(MAX_IMAGES,assets.length+next.length);
    setAssets(current=>[...current,...next].slice(0,MAX_IMAGES));
    if(nextCount>1){
      const suggested=nextCount===2?"duo":nextCount===3?"hero":nextCount===4?"quad":nextCount===5?"mosaic":"six";
      setLayout(suggested);
    }else setLayout("one");
    setError("");
    if(next.length>MAX_IMAGES-assets.length)setError("A story collage can contain up to 6 images.");
  }

  async function chooseImages(){
    setError("");
    try{
      const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
      if(!permission.granted){setError("Allow photo-library access to choose story images.");return;}
      const result=await ImagePicker.launchImageLibraryAsync({
        mediaTypes:["images"],allowsMultipleSelection:true,selectionLimit:MAX_IMAGES-assets.length,
        orderedSelection:true,quality:0.92,exif:false,
        preferredAssetRepresentationMode:ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if(!result.canceled)addAssets(result.assets);
    }catch(caught){setError(getApiErrorMessage(caught));}
  }

  async function takePhoto(){
    setError("");
    try{
      const permission=await ImagePicker.requestCameraPermissionsAsync();
      if(!permission.granted){setError("Allow camera access in device settings to take a story photo.");return;}
      const result=await ImagePicker.launchCameraAsync({mediaTypes:["images"],allowsEditing:true,aspect:[9,16],quality:0.92,exif:false});
      if(!result.canceled)addAssets(result.assets);
    }catch(caught){setError(getApiErrorMessage(caught));}
  }

  function addText(){
    if(texts.length>=MAX_TEXT)return;
    const next:StoryText={id:makeId(),value:"Tap to edit",x:50,y:72,size:28,color:"#ffffff",background:true,backgroundColor:"#000000",italic:false};
    setTexts(current=>[...current,next]);setSelectedTextId(next.id);
  }
  function updateText(id:string,changes:Partial<StoryText>){
    setTexts(current=>current.map(item=>item.id===id?{...item,...changes}:item));
  }

  async function addCurrentLocation(){
    setLocationBusy(true);setError("");
    try{
      const permission=await Location.requestForegroundPermissionsAsync();
      if(!permission.granted){setError("Location permission is required to place a story on Stories Globe. You can enable it in device settings.");return;}
      const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
      setLocation({lat:Number(position.coords.latitude.toFixed(6)),lng:Number(position.coords.longitude.toFixed(6))});
    }catch(caught){setError(getApiErrorMessage(caught));}
    finally{setLocationBusy(false);}
  }

  function onStageLayout(event:LayoutChangeEvent){
    stageSize.current={width:event.nativeEvent.layout.width,height:event.nativeEvent.layout.height};
  }
  function makePathPoint(event:GestureResponderEvent):Point{
    const {width,height}=stageSize.current;
    return {x:clamp(event.nativeEvent.locationX/Math.max(width,1)*360,0,360),y:clamp(event.nativeEvent.locationY/Math.max(height,1)*640,0,640)};
  }
  function startStroke(event:GestureResponderEvent){
    const point=makePathPoint(event);setActiveStroke("M "+point.x.toFixed(1)+" "+point.y.toFixed(1));
  }
  function moveStroke(event:GestureResponderEvent){
    const point=makePathPoint(event);setActiveStroke(current=>current+" L "+point.x.toFixed(1)+" "+point.y.toFixed(1));
  }
  function finishStroke(){
    setStrokes(current=>activeStroke?[...current,{d:activeStroke,color:brushColor,width:brushSize}]:current);setActiveStroke("");
  }

  function renderStoryMedia(){
    const activeBackground=BACKGROUNDS.find(item=>item.id===background)?.color||"#16070D";
    const cells=STORY_CELLS[layout]||STORY_CELLS.one;
    if(!assets.length)return <View className="h-full w-full items-center justify-center" style={{backgroundColor:activeBackground}}><MaterialCommunityIcons name="image-plus" size={48} color={colors.rose}/><Text className="mt-3 text-sm font-bold" style={{color:colors.text}}>Your story preview</Text></View>;
    return <View className="h-full w-full overflow-hidden" style={{backgroundColor:activeBackground}}>
      {cells.map((cell,index)=>{
        const asset=assets[index];
        if(!asset)return null;
        const inset=gap/2;
        return <View key={asset.assetId||asset.uri+index} style={{
          position:"absolute",left:(cell.x+"%") as `${number}%`,top:(cell.y+"%") as `${number}%`,
          width:(cell.w+"%") as `${number}%`,height:(cell.h+"%") as `${number}%`,
          padding:inset,
        }}>
          <View className="h-full w-full overflow-hidden" style={{borderRadius:cornerRadius,backgroundColor:"#090609"}}>
            <Image source={{uri:asset.uri}} resizeMode="cover" style={{width:"100%",height:"100%"}}/>
          </View>
        </View>;
      })}
    </View>;
  }

  async function publish(){
    if(publishing)return;
    if(!assets.length){setError("Choose at least one image for your story.");return;}
    if(!location){setError("Add the location you want to share before publishing this Stories Globe story.");return;}
    setPublishing(true);setProgress(0);setError("");
    let uploaded:UploadedImage|null=null;
    try{
      if(!previewRef.current)throw new Error("The story preview is not ready.");
      const uri=await captureRef(previewRef,{format:"png",quality:1,result:"tmpfile",width:1080,height:1920});
      uploaded=await uploadLocalImage(uri,"zenigram-story.png","image/png",setProgress);
      const {data}=await api.post("/api/story-upload",{
        mediaKey:uploaded.key,mediaType:"image",caption:caption.trim().slice(0,500),location,duration,
        timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC",
      });
      const story=data?.story||data;
      const storyId=story?._id||story?.story?._id;
      if(!storyId)throw new Error("Zenigram did not confirm story creation.");
      setProgress(100);router.replace("/story/"+encodeURIComponent(String(storyId)));
    }catch(caught){
      if(uploaded?.key)await deleteUploadedMedia([uploaded.key]).catch(()=>{});
      setError(getApiErrorMessage(caught));
    }finally{setPublishing(false);}
  }

  return <Screen>
    <View className="mb-5 flex-row items-center">
      <Pressable onPress={()=>router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{borderColor:colors.line,backgroundColor:colors.panel}}><MaterialCommunityIcons name="arrow-left" size={21} color={colors.text}/></Pressable>
      <View className="flex-1"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.rose}}>STORY STUDIO</Text><Text className="mt-1 text-2xl font-black" style={{color:colors.text}}>Create a story</Text></View>
      <View className="rounded-xl px-3 py-2" style={{backgroundColor:colors.wine}}><Text className="text-xs font-black" style={{color:colors.rose}}>{duration}s</Text></View>
    </View>

    {error?<View className="mb-4 rounded-2xl border p-3" style={{backgroundColor:colors.panel,borderColor:colors.danger}}><Text className="text-sm leading-5" style={{color:colors.danger}}>{error}</Text></View>:null}

    <View ref={previewRef} collapsable={false} onLayout={onStageLayout} className="mb-4 overflow-hidden rounded-3xl" style={{width:"100%",aspectRatio:9/16,maxHeight:560,backgroundColor:BACKGROUNDS.find(item=>item.id===background)?.color||"#16070D"}}>
      {renderStoryMedia()}
      <View pointerEvents="none" className="absolute inset-0" style={{backgroundColor:activeFilter.tint}}/>
      {texts.map(item=><View key={item.id} pointerEvents="none" className="absolute max-w-[88%] rounded-xl px-3 py-2" style={{
        left:(Math.max(0,Math.min(88,item.x-30))+"%") as `${number}%`,top:(item.y+"%") as `${number}%`,backgroundColor:item.background?item.backgroundColor+"CC":"transparent",
      }}><Text style={{color:item.color,fontSize:item.size,fontWeight:"800",fontStyle:item.italic?"italic":"normal"}}>{item.value}</Text></View>)}
      <Svg pointerEvents="none" viewBox="0 0 360 640" style={{position:"absolute",top:0,left:0,width:"100%",height:"100%"}}>
        {strokes.map((stroke,index)=><Path key={index} d={stroke.d} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" fill="none"/>)}
        {activeStroke?<Path d={activeStroke} stroke={brushColor} strokeWidth={brushSize} strokeLinecap="round" strokeLinejoin="round" fill="none"/>:null}
      </Svg>
      <View pointerEvents={drawing?"auto":"none"} className="absolute inset-0" onStartShouldSetResponder={()=>drawing} onMoveShouldSetResponder={()=>drawing} onResponderGrant={startStroke} onResponderMove={moveStroke} onResponderRelease={finishStroke} onResponderTerminate={finishStroke}/>
      <View pointerEvents="none" className="absolute left-3 top-3 rounded-full px-3 py-2" style={{backgroundColor:"rgba(10,5,8,0.65)"}}><Text className="text-[10px] font-black tracking-widest" style={{color:"#FFFFFF"}}>ZENIGRAM STORY</Text></View>
    </View>

    <View className="mb-4 flex-row">
      <Pressable onPress={()=>void chooseImages()} disabled={publishing||assets.length>=MAX_IMAGES} className="mr-2 flex-1 flex-row items-center justify-center rounded-2xl border px-3 py-3" style={{backgroundColor:colors.panel,borderColor:colors.line,opacity:assets.length>=MAX_IMAGES?0.45:1}}><MaterialCommunityIcons name="image-multiple-outline" size={19} color={colors.rose}/><Text className="ml-2 text-xs font-bold" style={{color:colors.text}}>Add images</Text></Pressable>
      <Pressable onPress={()=>void takePhoto()} disabled={publishing||assets.length>=MAX_IMAGES} className="flex-1 flex-row items-center justify-center rounded-2xl px-3 py-3" style={{backgroundColor:colors.wine}}><MaterialCommunityIcons name="camera-outline" size={19} color={colors.rose}/><Text className="ml-2 text-xs font-bold" style={{color:colors.rose}}>Camera</Text></Pressable>
    </View>

    {assets.length?<View className="mb-4">
      <View className="mb-2 flex-row items-center justify-between"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Story images · {assets.length}/{MAX_IMAGES}</Text><Pressable onPress={()=>setAssets([])} disabled={publishing}><Text className="text-xs font-semibold" style={{color:colors.danger}}>Clear all</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>{assets.map((asset,index)=><View key={asset.assetId||asset.uri+index} className="mr-2 h-20 w-16 overflow-hidden rounded-xl" style={{backgroundColor:colors.surface}}>
        <Image source={{uri:asset.uri}} resizeMode="cover" className="h-full w-full"/><View className="absolute left-1 top-1 rounded px-1" style={{backgroundColor:"rgba(0,0,0,0.7)"}}><Text className="text-[10px] font-bold text-white">{index+1}</Text></View>
        <Pressable onPress={()=>setAssets(old=>old.filter((_,i)=>i!==index))} className="absolute right-1 top-1 h-5 w-5 items-center justify-center rounded-full" style={{backgroundColor:"rgba(0,0,0,0.75)"}}><MaterialCommunityIcons name="close" size={13} color="#FFFFFF"/></Pressable>
      </View>)}</ScrollView>
    </View>:null}

    <View className="mb-4 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Layout · website presets</Text>
      <View className="flex-row flex-wrap">{LAYOUTS.map(item=><Pressable key={item.id} onPress={()=>setLayout(item.id)} disabled={publishing} className="mb-2 mr-2 flex-row items-center rounded-xl border px-3 py-3" style={{borderColor:layout===item.id?colors.rose:colors.line,backgroundColor:layout===item.id?colors.wine:colors.surface}}>
        <MaterialCommunityIcons name={item.icon as never} size={17} color={layout===item.id?colors.rose:colors.muted}/><Text className="ml-2 text-xs font-bold" style={{color:layout===item.id?colors.rose:colors.muted}}>{item.label}</Text>
      </Pressable>)}</View>
      <Text className="mb-2 mt-3 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Background</Text>
      <View className="flex-row flex-wrap">{BACKGROUNDS.map(item=><Pressable key={item.id} onPress={()=>setBackground(item.id)} disabled={publishing} className="mb-2 mr-2 flex-row items-center rounded-full border px-3 py-2" style={{borderColor:background===item.id?colors.rose:colors.line,backgroundColor:colors.surface}}>
        <View className="mr-2 h-4 w-4 rounded-full" style={{backgroundColor:item.color}}/><Text className="text-xs font-semibold" style={{color:background===item.id?colors.rose:colors.muted}}>{item.label}</Text>
      </Pressable>)}</View>
      <StoryRange label="Collage gap" value={gap} min={0} max={12} onChange={setGap}/>
      <StoryRange label="Image corner radius" value={cornerRadius} min={0} max={28} onChange={setCornerRadius}/>
      <Text className="mb-2 mt-3 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Filters</Text>
      <View className="flex-row flex-wrap">{FILTERS.map(item=><Pressable key={item.id} onPress={()=>setFilter(item.id)} disabled={publishing} className="mb-2 mr-2 rounded-full border px-3 py-2" style={{borderColor:filter===item.id?colors.rose:colors.line,backgroundColor:filter===item.id?colors.wine:colors.surface}}><Text className="text-xs font-semibold" style={{color:filter===item.id?colors.rose:colors.muted}}>{item.label}</Text></Pressable>)}</View>
      <StoryRange label="Story duration (seconds)" value={duration} min={5} max={60} onChange={setDuration}/>
    </View>

    <View className="mb-4 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <View className="mb-3 flex-row items-center justify-between"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Text layers · {texts.length}/{MAX_TEXT}</Text><Pressable onPress={addText} disabled={publishing||texts.length>=MAX_TEXT} className="flex-row items-center rounded-xl px-3 py-2" style={{backgroundColor:colors.wine,opacity:texts.length>=MAX_TEXT?0.45:1}}><MaterialCommunityIcons name="format-text" size={17} color={colors.rose}/><Text className="ml-1 text-xs font-bold" style={{color:colors.rose}}>Add text</Text></Pressable></View>
      <View className="mb-3 flex-row flex-wrap">{texts.map(item=><Pressable key={item.id} onPress={()=>setSelectedTextId(item.id)} className="mb-2 mr-2 rounded-full border px-3 py-2" style={{borderColor:selectedTextId===item.id?colors.rose:colors.line,backgroundColor:selectedTextId===item.id?colors.wine:colors.surface}}><Text numberOfLines={1} className="text-xs font-semibold" style={{color:selectedTextId===item.id?colors.rose:colors.muted}}>{item.value||"Text layer"}</Text></Pressable>)}</View>
      {selectedText?<View>
        <TextInput value={selectedText.value} onChangeText={value=>updateText(selectedText.id,{value:value.slice(0,140)})} maxLength={140} multiline placeholder="Write your story text..." placeholderTextColor={colors.muted} className="min-h-16 rounded-2xl border p-3 text-sm" style={{backgroundColor:colors.surface,borderColor:colors.line,color:colors.text}}/>
        <StoryRange label="Horizontal position" value={selectedText.x} min={0} max={100} onChange={x=>updateText(selectedText.id,{x})}/>
        <StoryRange label="Vertical position" value={selectedText.y} min={0} max={95} onChange={y=>updateText(selectedText.id,{y})}/>
        <StoryRange label="Text size" value={selectedText.size} min={14} max={48} onChange={size=>updateText(selectedText.id,{size})}/>
        <View className="mt-3 flex-row flex-wrap items-center">{BRUSH_COLORS.map(color=><Pressable key={color} onPress={()=>updateText(selectedText.id,{color})} className="mr-3 h-8 w-8 rounded-full border-2" style={{backgroundColor:color,borderColor:selectedText.color===color?colors.rose:colors.line}} accessibilityLabel={"Set text color "+color}/>)}
          <Pressable onPress={()=>updateText(selectedText.id,{background:!selectedText.background})} className="rounded-full border px-3 py-2" style={{borderColor:colors.line}}><Text className="text-xs font-semibold" style={{color:colors.rose}}>{selectedText.background?"Hide background":"Show background"}</Text></Pressable>
          <Pressable onPress={()=>updateText(selectedText.id,{italic:!selectedText.italic})} className="ml-2 rounded-full border px-3 py-2" style={{borderColor:colors.line}}><Text className="text-xs italic font-semibold" style={{color:colors.rose}}>Italic</Text></Pressable>
          <Pressable onPress={()=>setTexts(old=>old.filter(item=>item.id!==selectedText.id))} className="ml-2 rounded-full border px-3 py-2" style={{borderColor:colors.danger}}><Text className="text-xs font-semibold" style={{color:colors.danger}}>Delete</Text></Pressable>
        </View>
      </View>:<Text className="text-xs leading-5" style={{color:colors.muted}}>Add up to eight text layers and position each on the story canvas.</Text>}
    </View>

    <View className="mb-4 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <View className="mb-3 flex-row items-center justify-between"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Draw on story</Text><Switch value={drawing} onValueChange={setDrawing} trackColor={{false:colors.surface,true:colors.crimson}} thumbColor={drawing?colors.rose:colors.muted}/></View>
      <View className="flex-row flex-wrap items-center">{BRUSH_COLORS.map(color=><Pressable key={color} onPress={()=>setBrushColor(color)} className="mr-3 h-8 w-8 rounded-full border-2" style={{backgroundColor:color,borderColor:brushColor===color?colors.rose:colors.line}} accessibilityLabel={"Set brush color "+color}/>)}
        <Pressable onPress={()=>setStrokes([])} className="ml-auto rounded-full border px-3 py-2" style={{borderColor:colors.line}}><Text className="text-xs font-semibold" style={{color:colors.rose}}>Clear drawing</Text></Pressable>
      </View>
      <StoryRange label="Brush size" value={brushSize} min={1} max={18} onChange={setBrushSize}/>
      <Text className="mt-2 text-[11px] leading-5" style={{color:colors.muted}}>{drawing?"Draw directly over the preview with your finger.":"Turn drawing on, then draw on the preview above."}</Text>
    </View>

    <View className="mb-4 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Caption · optional</Text>
      <TextInput value={caption} onChangeText={value=>setCaption(value.slice(0,500))} placeholder="Add a thought to this moment..." placeholderTextColor={colors.muted} multiline maxLength={500} textAlignVertical="top" className="min-h-20 text-sm leading-6" style={{color:colors.text}}/>
      <Text className="mt-2 self-end text-xs" style={{color:colors.muted}}>{caption.length}/500</Text>
    </View>

    <View className="mb-6 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <View className="flex-row items-center"><View className="mr-3 h-10 w-10 items-center justify-center rounded-full" style={{backgroundColor:colors.wine}}><MaterialCommunityIcons name="map-marker" size={20} color={colors.rose}/></View>
        <View className="flex-1"><Text className="text-sm font-bold" style={{color:colors.text}}>Stories Globe location</Text><Text className="mt-1 text-xs leading-5" style={{color:colors.muted}}>{location?"Coordinates added · not independently verified":"Location has not been added."}</Text></View>
        {location?<MaterialCommunityIcons name="check-circle" size={21} color={colors.success}/>:null}
      </View>
      <Pressable onPress={()=>void addCurrentLocation()} disabled={locationBusy||publishing} className="mt-4 flex-row items-center justify-center rounded-xl border px-3 py-3" style={{borderColor:colors.line}}>
        {locationBusy?<ActivityIndicator color={colors.rose}/>:<MaterialCommunityIcons name="crosshairs-gps" size={18} color={colors.rose}/>}<Text className="ml-2 text-sm font-semibold" style={{color:colors.rose}}>{location?"Refresh current location":"Add current location"}</Text>
      </Pressable>
      {location?<Pressable onPress={()=>setLocation(null)} disabled={publishing} className="mt-3 self-center"><Text className="text-xs font-semibold" style={{color:colors.muted}}>Remove location</Text></Pressable>:null}
      <Text className="mt-3 text-xs leading-5" style={{color:colors.muted}}>The story is pinned to Stories Globe using the coordinates you approve. The server marks this location as unverified. Do not add it when you do not want to share where the moment was captured.</Text>
    </View>

    {publishing?<View className="mb-3"><View className="mb-2 flex-row justify-between"><Text className="text-xs font-semibold" style={{color:colors.rose}}>Rendering and uploading story</Text><Text className="text-xs font-bold" style={{color:colors.text}}>{progress}%</Text></View><View className="h-2 overflow-hidden rounded-full" style={{backgroundColor:colors.surface}}><View className="h-2 rounded-full" style={{width:(progress+"%") as `${number}%`,backgroundColor:colors.crimson}}/></View></View>:null}
    <Pressable onPress={()=>void publish()} disabled={!assets.length||!location||publishing} className="mb-8 flex-row items-center justify-center rounded-2xl px-4 py-4" style={{backgroundColor:colors.rose,opacity:!assets.length||!location||publishing?0.45:1}}>
      {publishing?<ActivityIndicator color={colors.background}/>:<MaterialCommunityIcons name="send" size={19} color={colors.background}/>}<Text className="ml-2 text-base font-bold" style={{color:colors.background}}>{publishing?"Publishing...":"Share story"}</Text>
    </Pressable>
  </Screen>;
}
