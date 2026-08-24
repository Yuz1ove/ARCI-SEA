import type { NetworkNodeId, RouteId } from './types';

export type GeoPoint={lng:number;lat:number;label:string};
export type MapPoint={x:number;y:number;label:string;lng:number;lat:number};

export const mapProjection={width:760,height:520,paddingX:42,paddingY:34,minLng:117.9,maxLng:122.2,minLat:21.75,maxLat:26.45} as const;
const n=(value:number)=>Number(value.toFixed(1));

// One equirectangular projection is shared by island geometry, fulfillment nodes and every route.
export function projectGeoPoint({lng,lat}:{lng:number;lat:number}){
  const {width,height,paddingX,paddingY,minLng,maxLng,minLat,maxLat}=mapProjection;
  return {x:n(paddingX+(lng-minLng)/(maxLng-minLng)*(width-paddingX*2)),y:n(paddingY+(maxLat-lat)/(maxLat-minLat)*(height-paddingY*2))};
}

export const networkNodeCoordinates:Record<NetworkNodeId,{lng:number;lat:number;label:string}>={
  'warehouse-a':{lng:121.2168,lat:24.9537,label:'桃園／北部'},
  'warehouse-b':{lng:120.6736,lat:24.1477,label:'臺中／中部'},
  'warehouse-c':{lng:120.3014,lat:22.6273,label:'高雄／南部'},
  penghu:{lng:119.5664,lat:23.5690,label:'澎湖'},
  kinmen:{lng:118.3171,lat:24.4321,label:'金門'},
  matsu:{lng:119.9499,lat:26.1602,label:'馬祖'},
  'green-island':{lng:121.4934,lat:22.6617,label:'綠島'},
};

export const networkNodeAnchors=Object.fromEntries(Object.entries(networkNodeCoordinates).map(([id,point])=>[id,projectGeoPoint(point)])) as Record<NetworkNodeId,{x:number;y:number}>;

// Restored Natural Earth 1:10m coastline used by the last accepted map. It is immutable and never derived from nodes.
export const taiwanGeometry=Object.freeze({
  path:'M469.2 92.0 L459.7 103.4 L457.8 112.5 L458.7 128.7 L460.2 131.3 L466.4 134.3 L461.7 135.2 L463.4 139.9 L463.1 142.3 L460.5 143.7 L461.6 148.2 L454.7 154.1 L452.2 166.1 L453.9 168.9 L441.2 182.8 L434.9 196.8 L437.4 204.2 L425 247 L418.1 284.8 L412 295.4 L411 308.5 L405 316 L399.5 330.9 L394.4 338.3 L386.9 344.8 L385.4 352.6 L368.3 367.1 L359 382.8 L356.1 395 L351.4 404.5 L351.1 439.3 L349.3 444.9 L346.1 447.5 L346.6 457.4 L338.3 450.9 L334.8 450.1 L334.7 452.9 L332.2 453.5 L330.5 452.2 L331 448.2 L328.4 443.3 L330.1 432.4 L321.4 410.6 L315.5 401.1 L309.6 397.2 L308.9 395 L297.5 388.1 L293.8 387.9 L288.1 383.6 L282.8 376.4 L288.4 382.9 L286.1 376.8 L277.6 366.9 L278.3 360.8 L273 350.9 L273.4 345.2 L270.2 339.9 L268.8 331.5 L266.3 328.4 L269.6 324.4 L269.1 322.2 L266.3 321.8 L264.6 325.1 L263.1 325.1 L262.4 320.2 L260.6 319.4 L257.6 321.8 L256.3 320.8 L256.8 316.9 L261.5 314.4 L256.8 312.7 L260.3 311.9 L256.8 307.9 L260 304.2 L259 301.2 L262.5 291.6 L264.3 290.6 L262.7 289.6 L263.4 287.9 L267.1 287.3 L266.8 286 L263.9 286.4 L263.9 285 L265 282.7 L268.9 282.6 L265 271.9 L268.1 267 L264.4 267.2 L264.3 263.6 L266.3 261.4 L266.5 249.4 L271.2 234.3 L283.6 216.6 L290.3 201.4 L297.4 194.4 L298.5 187.7 L306.7 178.3 L314.2 159.7 L324.6 147.9 L330.7 133.2 L333.7 132.3 L339.5 126.1 L345.1 126.1 L344.6 123.8 L354.6 108 L353.8 105.6 L356.5 99.8 L359.7 97.4 L365.6 85.9 L371.8 80 L389.3 72.7 L403 70.3 L408.6 67 L416 69.6 L410.5 64.1 L415.2 57 L422.2 52.5 L431.8 52 L439.7 62.3 L443.7 61.9 L442.8 64.5 L445.9 67.2 L467.7 72.4 L469.1 73.2 L468.5 78.1 L470.7 83.4 L476.3 83.5 L480.6 85.8 Z',
  transform:'matrix(0.867841 0.149804 -0.115753 0.834107 214.242 49.302)',
} as const);

// Display-simplified offshore polygons share the map projection, but remain independent of node and route state.
const islandLngLat={
  penghu:[[119.48,23.62],[119.54,23.69],[119.63,23.67],[119.69,23.60],[119.65,23.52],[119.56,23.48],[119.48,23.54]],
  kinmen:[[118.19,24.47],[118.27,24.51],[118.39,24.50],[118.46,24.43],[118.39,24.36],[118.28,24.37],[118.20,24.41]],
  matsu:[[119.88,26.20],[119.94,26.25],[120.03,26.22],[120.08,26.14],[120.01,26.08],[119.92,26.10]],
  greenIsland:[[121.47,22.70],[121.51,22.71],[121.54,22.68],[121.54,22.64],[121.51,22.61],[121.47,22.62],[121.45,22.66]],
} as const;

const polygonPath=(points:readonly (readonly [number,number])[])=>points.map(([lng,lat],index)=>{const point=projectGeoPoint({lng,lat});return `${index===0?'M':'L'}${point.x} ${point.y}`;}).join(' ')+' Z';
export const islandGeometry=Object.freeze({penghu:polygonPath(islandLngLat.penghu),kinmen:polygonPath(islandLngLat.kinmen),matsu:polygonPath(islandLngLat.matsu),greenIsland:polygonPath(islandLngLat.greenIsland)});

const corridorGeo:GeoPoint[]=[
  {lng:121.2168,lat:24.9537,label:'桃園／北部'},
  {lng:120.95,lat:24.78,label:'新竹'},
  {lng:120.78,lat:24.48,label:'苗栗'},
  {lng:120.6736,lat:24.1477,label:'臺中'},
  {lng:120.45,lat:23.48,label:'嘉義'},
  {lng:120.29,lat:22.99,label:'臺南'},
  {lng:120.3014,lat:22.6273,label:'高雄／南部'},
];

const projectWaypoints=(points:GeoPoint[]):MapPoint[]=>points.map(point=>({...point,...projectGeoPoint(point)}));
export const westernCorridor=projectWaypoints(corridorGeo);
const shiftLng=(points:GeoPoint[],offsets:number[])=>points.map((point,index)=>({...point,lng:point.lng+(offsets[index]??0)}));
export const routeWaypoints:Record<RouteId,MapPoint[]>={
  'route-a':westernCorridor,
  'route-b':projectWaypoints(shiftLng(corridorGeo,[0,-.03,-.04,-.05,-.04,-.02,0])),
  'route-c':projectWaypoints([...shiftLng(corridorGeo,[0,.015,.02,-.03,-.04,-.02,0])].reverse()),
  'route-d':projectWaypoints(shiftLng(corridorGeo,[0,.025,.01,-.02,-.03,-.01,0])),
};

export function pathFromWaypoints(points:MapPoint[]){
  if(points.length<2) return '';
  const commands=[`M${points[0].x} ${points[0].y}`];
  for(let index=0;index<points.length-1;index++){
    const previous=points[index-1]??points[index],current=points[index],next=points[index+1],after=points[index+2]??next;
    const controlA={x:current.x+(next.x-previous.x)/6,y:current.y+(next.y-previous.y)/6};
    const controlB={x:next.x-(after.x-current.x)/6,y:next.y-(after.y-current.y)/6};
    commands.push(`C${n(controlA.x)} ${n(controlA.y)} ${n(controlB.x)} ${n(controlB.y)} ${next.x} ${next.y}`);
  }
  return commands.join(' ');
}

export const logisticsRoutes:Record<RouteId,{path:string;corridor:string;duration:number;waypoints:MapPoint[]}>=Object.fromEntries(
  (Object.keys(routeWaypoints) as RouteId[]).map(id=>[id,{path:pathFromWaypoints(routeWaypoints[id]),waypoints:routeWaypoints[id],corridor:{'route-a':'西部原幹線','route-b':'西部替代走廊','route-c':'西部南北直連','route-d':'北部集貨支線'}[id],duration:{'route-a':10.2,'route-b':8.8,'route-c':8.2,'route-d':9.4}[id]}]),
) as Record<RouteId,{path:string;corridor:string;duration:number;waypoints:MapPoint[]}>;

export const routeAnchors={
  'taitung-gateway':{...projectGeoPoint({lng:121.1438,lat:22.7554}),label:'臺東／東南岸 gateway'},
} as const;
const curvedLink=(a:{x:number;y:number},b:{x:number;y:number},bend:number)=>`M${a.x} ${a.y} Q${n((a.x+b.x)/2)} ${n((a.y+b.y)/2+bend)} ${b.x} ${b.y}`;
export const offshoreRoutes=[
  {id:'penghu-link',from:'warehouse-c' as const,to:'penghu' as const,type:'SEA / AIR',path:curvedLink(networkNodeAnchors['warehouse-c'],networkNodeAnchors.penghu,-25)},
  {id:'kinmen-link',from:'warehouse-c' as const,to:'kinmen' as const,type:'AIR / SEA',path:curvedLink(networkNodeAnchors['warehouse-c'],networkNodeAnchors.kinmen,38)},
  {id:'matsu-link',from:'warehouse-a' as const,to:'matsu' as const,type:'AIR',path:curvedLink(networkNodeAnchors['warehouse-a'],networkNodeAnchors.matsu,-28)},
  {id:'green-island-link',from:'taitung-gateway' as const,to:'green-island' as const,type:'SEA / AIR',path:curvedLink(routeAnchors['taitung-gateway'],networkNodeAnchors['green-island'],-11)},
];

// Conservative north-to-south longitude boundary for the central mountain belt.
export const mountainBoundaryLngByWaypoint=[121.35,121.15,121.05,120.93,120.75,120.60,120.55];
