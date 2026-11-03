import { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  deleteUploadedMedia, uploadPickedImage, uploadPickedVideo,
  type UploadedImage, type UploadedVideo,
} from "@/lib/nativeUpload";
import { colors } from "@/theme/colors";

const MAX_MEDIA=10;
const TOPICS=[
  ["technology","Technology"],["education","Education"],["gaming","Gaming"],["travel","Travel"],
  ["sports","Sports"],["art","Art & Design"],["food","Food"],["fashion","Fashion"],
  ["news","News"],["entertainment","Entertainment"],["fitness","Fitness"],
] as const;
const PRESENTATIONS=[
  {id:"single",label:"Single",icon:"image-outline"},
  {id:"carousel",label:"Carousel",icon:"view-carousel-outline"},
  {id:"grid",label:"Grid",icon:"view-grid-outline"},
] as const;
const CAROUSEL_STYLES=["classic","fade","stack","filmstrip","zoom","flip","cube"] as const;
const GRID_LAYOUTS=["tiles","hero","columns","strips"] as const;
const ASPECT_RATIOS=[
  {id:"portrait",label:"Portrait 4:5"},
  {id:"square",label:"Square 1:1"},
  {id:"landscape",label:"Landscape 16:9"},
] as const;

type MediaAsset=ImagePicker.ImagePickerAsset&{type:"image"|"video"};
type UploadedMedia=UploadedImage|UploadedVideo;

function VideoThumb({uri}:{uri:string}){
  const player=useVideoPlayer(uri,p=>{p.loop=true;p.muted=true;});
  return <VideoView player={player} contentFit="cover" nativeControls={false} style={{width:"100%",height:"100%"}}/>;
}

export default function CreateScreen(){
  const [assets,setAssets]=useState<MediaAsset[]>([]);
  const [caption,setCaption]=useState("");
  const [topics,setTopics]=useState<string[]>([]);
  const [closeOnesOnly,setCloseOnesOnly]=useState(false);
  const [presentation,setPresentation]=useState<"single"|"carousel"|"grid">("single");
  const [carouselStyle,setCarouselStyle]=useState<(typeof CAROUSEL_STYLES)[number]>("classic");
  const [gridLayout,setGridLayout]=useState<(typeof GRID_LAYOUTS)[number]>("tiles");
  const [aspectRatio,setAspectRatio]=useState<(typeof ASPECT_RATIOS)[number]["id"]>("portrait");
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const totalSize=useMemo(()=>assets.reduce((total,asset)=>total+Number(asset.fileSize||0),0),[assets]);
  const imageCount=assets.filter(asset=>asset.type==="image").length;
  const videoCount=assets.length-imageCount;

  function addAssets(next:ImagePicker.ImagePickerAsset[]){
    const eligible=next.filter((item):item is MediaAsset=>item.type==="image"||item.type==="video");
    setAssets(current=>[...current,...eligible].slice(0,MAX_MEDIA));
    setError("");setNotice("");
    if(assets.length+eligible.length>MAX_MEDIA)setError("A post can contain up to 10 images and videos.");
  }

  async function pickMedia(){
    if(busy||assets.length>=MAX_MEDIA)return;
    setError("");
    try{
      const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
      if(!permission.granted){setError("Allow photo and video library access to choose post media.");return;}
      const result=await ImagePicker.launchImageLibraryAsync({
        mediaTypes:["images","videos"],allowsMultipleSelection:true,
        selectionLimit:MAX_MEDIA-assets.length,orderedSelection:true,quality:0.92,exif:false,
        videoExportPreset:ImagePicker.VideoExportPreset.Passthrough,
        preferredAssetRepresentationMode:ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if(!result.canceled)addAssets(result.assets);
    }catch(caught){setError(getApiErrorMessage(caught));}
  }

  async function takePhoto(){
    if(busy||assets.length>=MAX_MEDIA)return;
    setError("");
    try{
      const permission=await ImagePicker.requestCameraPermissionsAsync();
      if(!permission.granted){setError("Allow camera access in your device settings to take a photo.");return;}
      const result=await ImagePicker.launchCameraAsync({mediaTypes:["images"],allowsEditing:true,aspect:[4,5],quality:0.9,exif:false});
      if(!result.canceled)addAssets(result.assets);
    }catch(caught){setError(getApiErrorMessage(caught));}
  }

  function toggleTopic(id:string){
    setTopics(current=>current.includes(id)?current.filter(topic=>topic!==id):current.length<5?[...current,id]:current);
  }

  function moveAsset(index:number,direction:-1|1){
    const target=index+direction;if(target<0||target>=assets.length)return;
    setAssets(current=>{const next=[...current];const [item]=next.splice(index,1);next.splice(target,0,item);return next;});
  }

  async function publishPost(){
    if(busy)return;
    if(!assets.length){setError("Choose at least one photo or video before publishing.");return;}
    if(!caption.trim()){setError("Write a caption before publishing.");return;}
    const chosenPresentation=assets.length===1?"single":presentation==="single"?"carousel":presentation;
    setBusy(true);setProgress(0);setError("");setNotice("");
    const uploaded:UploadedMedia[]=[];
    try{
      for(let index=0;index<assets.length;index++){
        const asset=assets[index];
        const onProgress=(percent:number)=>{
          const overall=Math.round(((index+percent/100)/assets.length)*100);
          setProgress(Math.min(99,overall));
        };
        const media=asset.type==="video"
          ?await uploadPickedVideo(asset,onProgress)
          :await uploadPickedImage(asset,onProgress);
        uploaded.push(media);
      }

      await api.post("/api/posts",{
        caption:caption.trim(),mediaItems:uploaded,topics,
        presentation:chosenPresentation,
        carouselStyle:chosenPresentation==="carousel"?carouselStyle:"classic",
        gridLayout:chosenPresentation==="grid"?gridLayout:"",
        aspectRatio,closeOnesOnly,
      });

      setProgress(100);setNotice("Your post is live.");
      setAssets([]);setCaption("");setTopics([]);setCloseOnesOnly(false);
      setPresentation("single");setCarouselStyle("classic");setGridLayout("tiles");
      router.replace("/(tabs)");
    }catch(caught){
      if(uploaded.length)await deleteUploadedMedia(uploaded.map(item=>item.key)).catch(()=>{});
      setError(getApiErrorMessage(caught));
    }finally{setBusy(false);}
  }

  return <Screen>
    <View className="mb-6 flex-row items-center justify-between">
      <View className="flex-1 pr-3"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.rose}}>MAKE SOMETHING YOURS</Text><Text className="mt-1 text-3xl font-black" style={{color:colors.text}}>Create a post</Text><Text className="mt-2 text-sm leading-6" style={{color:colors.muted}}>Share photos and videos as a single post, carousel or collage.</Text></View>
      <Pressable onPress={()=>router.push("/clip/create")} disabled={busy} className="items-center justify-center rounded-2xl px-3 py-3" style={{backgroundColor:colors.wine,borderWidth:1,borderColor:colors.line}}>
        <MaterialCommunityIcons name="movie-plus-outline" size={20} color={colors.rose}/><Text className="mt-1 text-xs font-bold" style={{color:colors.rose}}>Clip</Text>
      </Pressable>
    </View>

    {error?<View className="mb-4 rounded-2xl border p-3" style={{backgroundColor:colors.panel,borderColor:colors.danger}}><Text className="text-sm leading-5" style={{color:colors.danger}}>{error}</Text></View>:null}
    {notice?<Text className="mb-3 text-sm font-semibold" style={{color:colors.success}}>{notice}</Text>:null}

    <View className="mb-5 flex-row">
      <Pressable onPress={()=>void pickMedia()} disabled={busy||assets.length>=MAX_MEDIA} className="mr-2 flex-1 flex-row items-center justify-center rounded-2xl border px-3 py-4" style={{backgroundColor:colors.panel,borderColor:colors.line,opacity:busy||assets.length>=MAX_MEDIA?0.45:1}}>
        <MaterialCommunityIcons name="image-multiple-outline" size={20} color={colors.rose}/><Text className="ml-2 text-sm font-bold" style={{color:colors.text}}>Choose media</Text>
      </Pressable>
      <Pressable onPress={()=>void takePhoto()} disabled={busy||assets.length>=MAX_MEDIA} className="flex-1 flex-row items-center justify-center rounded-2xl px-3 py-4" style={{backgroundColor:colors.wine,opacity:busy||assets.length>=MAX_MEDIA?0.45:1}}>
        <MaterialCommunityIcons name="camera-outline" size={20} color={colors.rose}/><Text className="ml-2 text-sm font-bold" style={{color:colors.rose}}>Take photo</Text>
      </Pressable>
    </View>

    {assets.length?<View className="mb-5">
      <View className="mb-3 flex-row items-center justify-between"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Media · {assets.length}/{MAX_MEDIA}</Text><Text className="text-xs" style={{color:colors.muted}}>{imageCount} photos · {videoCount} videos · {(totalSize/1048576).toFixed(1)} MB</Text></View>
      <View className="flex-row flex-wrap">{assets.map((asset,index)=><View key={asset.assetId||asset.uri+index} className="mb-2 mr-2 overflow-hidden rounded-2xl" style={{width:"31%",aspectRatio:0.82,backgroundColor:colors.surface}}>
        {asset.type==="image"?<Image source={{uri:asset.uri}} resizeMode="cover" className="h-full w-full"/>:<VideoThumb uri={asset.uri}/>}
        <View className="absolute left-2 top-2 rounded-full px-2 py-1" style={{backgroundColor:"rgba(19,9,13,0.8)"}}><Text className="text-xs font-bold" style={{color:colors.text}}>{index+1}</Text></View>
        <View className="absolute bottom-2 left-2 rounded px-1.5 py-1" style={{backgroundColor:"rgba(19,9,13,0.85)"}}><Text className="text-[9px] font-bold uppercase" style={{color:colors.rose}}>{asset.type}</Text></View>
        <View className="absolute right-2 top-2 flex-row">
          <Pressable onPress={()=>moveAsset(index,-1)} disabled={busy||index===0} className="mr-1 h-7 w-7 items-center justify-center rounded-full" style={{backgroundColor:"rgba(19,9,13,0.85)"}} accessibilityLabel="Move media earlier"><MaterialCommunityIcons name="chevron-left" size={16} color={index===0?colors.muted:"#FFFFFF"}/></Pressable>
          <Pressable onPress={()=>setAssets(current=>current.filter((_,i)=>i!==index))} disabled={busy} className="h-7 w-7 items-center justify-center rounded-full" style={{backgroundColor:"rgba(19,9,13,0.85)"}} accessibilityLabel={"Remove media "+(index+1)}><MaterialCommunityIcons name="close" size={16} color="#FFFFFF"/></Pressable>
        </View>
        {index<assets.length-1?<Pressable onPress={()=>moveAsset(index,1)} disabled={busy} className="absolute bottom-2 right-2 h-7 w-7 items-center justify-center rounded-full" style={{backgroundColor:"rgba(19,9,13,0.85)"}} accessibilityLabel="Move media later"><MaterialCommunityIcons name="chevron-right" size={16} color="#FFFFFF"/></Pressable>:null}
      </View>)}</View>
    </View>:<View className="mb-5 items-center justify-center rounded-3xl border border-dashed px-6 py-10" style={{borderColor:colors.line,backgroundColor:colors.panel}}>
      <MaterialCommunityIcons name="image-plus" size={38} color={colors.muted}/><Text className="mt-3 text-base font-bold" style={{color:colors.text}}>Add photos or videos</Text><Text className="mt-2 text-center text-xs leading-5" style={{color:colors.muted}}>Choose up to 10 items from your library or take a photo.</Text>
    </View>}

    <View className="mb-5 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Post format</Text>
      <View className="flex-row">{PRESENTATIONS.map(item=>{
        const active=(assets.length===1&&item.id==="single")||(assets.length>1&&presentation===item.id);
        const disabled=assets.length===0||(assets.length>1&&item.id==="single");
        return <Pressable key={item.id} disabled={busy||disabled} onPress={()=>setPresentation(item.id)} className="mr-2 flex-1 items-center rounded-xl border py-3" style={{borderColor:active?colors.rose:colors.line,backgroundColor:active?colors.wine:colors.surface,opacity:disabled?0.45:1}}>
          <MaterialCommunityIcons name={item.icon as never} size={19} color={active?colors.rose:colors.muted}/><Text className="mt-1 text-xs font-bold" style={{color:active?colors.rose:colors.muted}}>{item.label}</Text>
        </Pressable>;
      })}</View>
      {assets.length>1&&presentation==="carousel"?<>
        <Text className="mb-2 mt-4 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Carousel animation</Text>
        <View className="flex-row flex-wrap">{CAROUSEL_STYLES.map(style=><Pressable key={style} onPress={()=>setCarouselStyle(style)} disabled={busy} className="mb-2 mr-2 rounded-full border px-3 py-2" style={{borderColor:carouselStyle===style?colors.rose:colors.line,backgroundColor:carouselStyle===style?colors.wine:colors.surface}}><Text className="text-xs font-semibold capitalize" style={{color:carouselStyle===style?colors.rose:colors.muted}}>{style}</Text></Pressable>)}</View>
      </>:null}
      {assets.length>1&&presentation==="grid"?<>
        <Text className="mb-2 mt-4 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Grid layout</Text>
        <View className="flex-row flex-wrap">{GRID_LAYOUTS.map(style=><Pressable key={style} onPress={()=>setGridLayout(style)} disabled={busy} className="mb-2 mr-2 rounded-full border px-3 py-2" style={{borderColor:gridLayout===style?colors.rose:colors.line,backgroundColor:gridLayout===style?colors.wine:colors.surface}}><Text className="text-xs font-semibold capitalize" style={{color:gridLayout===style?colors.rose:colors.muted}}>{style}</Text></Pressable>)}</View>
      </>:null}
      <Text className="mb-2 mt-4 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Aspect ratio</Text>
      <View className="flex-row">{ASPECT_RATIOS.map(item=><Pressable key={item.id} onPress={()=>setAspectRatio(item.id)} disabled={busy} className="mr-2 flex-1 items-center rounded-xl border px-2 py-3" style={{borderColor:aspectRatio===item.id?colors.rose:colors.line,backgroundColor:aspectRatio===item.id?colors.wine:colors.surface}}><Text className="text-center text-[11px] font-semibold" style={{color:aspectRatio===item.id?colors.rose:colors.muted}}>{item.label}</Text></Pressable>)}</View>
    </View>

    <View className="mb-5 rounded-3xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Your caption</Text>
      <TextInput value={caption} onChangeText={value=>setCaption(value.slice(0,2200))} placeholder="What would you like to share?" placeholderTextColor={colors.muted} multiline maxLength={2200} textAlignVertical="top" className="min-h-28 text-sm leading-6" style={{color:colors.text}}/>
      <Text className="mt-2 self-end text-xs" style={{color:colors.muted}}>{caption.length}/2200</Text>
    </View>

    <View className="mb-5"><View className="mb-3 flex-row items-center justify-between"><Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.muted}}>Topics · optional</Text><Text className="text-xs" style={{color:colors.muted}}>{topics.length}/5 selected</Text></View>
      <View className="flex-row flex-wrap">{TOPICS.map(([id,label])=>{const active=topics.includes(id);return <Pressable key={id} disabled={busy||(!active&&topics.length>=5)} onPress={()=>toggleTopic(id)} className="mb-2 mr-2 rounded-full border px-3 py-2" style={{borderColor:active?colors.crimson:colors.line,backgroundColor:active?colors.wine:colors.panel}}><Text className="text-xs font-semibold" style={{color:active?colors.rose:colors.muted}}>{label}</Text></Pressable>;})}</View>
    </View>

    <View className="mb-6 flex-row items-center justify-between rounded-2xl border p-4" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <View className="flex-1 pr-3"><Text className="text-sm font-bold" style={{color:colors.text}}>Close Ones audience</Text><Text className="mt-1 text-xs leading-5" style={{color:colors.muted}}>Limit this post to your Close Ones.</Text></View>
      <Switch value={closeOnesOnly} onValueChange={setCloseOnesOnly} disabled={busy} trackColor={{false:colors.surface,true:colors.crimson}} thumbColor={closeOnesOnly?colors.rose:colors.muted}/>
    </View>

    {busy?<View className="mb-3"><View className="mb-2 flex-row justify-between"><Text className="text-xs font-semibold" style={{color:colors.rose}}>Uploading securely to S3</Text><Text className="text-xs font-bold" style={{color:colors.text}}>{progress}%</Text></View><View className="h-2 overflow-hidden rounded-full" style={{backgroundColor:colors.surface}}><View className="h-2 rounded-full" style={{width:progress+"%",backgroundColor:colors.crimson}}/></View></View>:null}
    <Pressable onPress={()=>void publishPost()} disabled={busy||!assets.length||!caption.trim()} accessibilityRole="button" accessibilityLabel="Publish post" className="mb-8 flex-row items-center justify-center rounded-2xl px-4 py-4" style={{backgroundColor:colors.rose,opacity:busy||!assets.length||!caption.trim()?0.5:1}}>
      {busy?<ActivityIndicator color={colors.background}/>:<MaterialCommunityIcons name="send" size={19} color={colors.background}/>}<Text className="ml-2 text-base font-bold" style={{color:colors.background}}>{busy?"Publishing...":"Share post"}</Text>
    </Pressable>
  </Screen>;
}
