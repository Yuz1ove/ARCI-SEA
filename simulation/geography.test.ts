import { describe,expect,it } from 'vitest';
import { islandGeometry,logisticsRoutes,mapProjection,mountainBoundaryLngByWaypoint,networkNodeAnchors,networkNodeCoordinates,offshoreRoutes,projectGeoPoint,routeAnchors,taiwanGeometry } from './geography';

describe('shared geographic projection',()=>{
  it('routes every mainland corridor through west-coast geographic waypoints',()=>{
    for(const route of Object.values(logisticsRoutes)){
      expect(route.waypoints).toHaveLength(7);
      expect(route.path).toContain('C');
      const northToSouth=route.waypoints[0].lat>route.waypoints.at(-1)!.lat?route.waypoints:[...route.waypoints].reverse();
      expect(northToSouth.map(point=>point.label)).toEqual(['桃園／北部','新竹','苗栗','臺中','嘉義','臺南','高雄／南部']);
      northToSouth.forEach((point,index)=>expect(point.lng).toBeLessThan(mountainBoundaryLngByWaypoint[index]));
    }
  });

  it('keeps the restored Taiwan outline immutable and independent from node geometry',()=>{
    expect(Object.isFrozen(taiwanGeometry)).toBe(true);
    expect(taiwanGeometry.path.split(' L').length).toBeGreaterThan(100);
    expect(taiwanGeometry.transform).toBe('matrix(0.867841 0.149804 -0.115753 0.834107 214.242 49.302)');
  });

  it('projects Taiwan, Penghu, Kinmen, Matsu and Green Island using the same bounds',()=>{
    expect(mapProjection.minLng).toBeLessThan(networkNodeCoordinates.kinmen.lng);
    expect(mapProjection.maxLat).toBeGreaterThan(networkNodeCoordinates.matsu.lat);
    for(const [id,coordinate] of Object.entries(networkNodeCoordinates)){
      expect(networkNodeAnchors[id as keyof typeof networkNodeAnchors]).toEqual(projectGeoPoint(coordinate));
    }
    expect(networkNodeAnchors.kinmen.x).toBeLessThan(networkNodeAnchors.penghu.x);
    expect(networkNodeAnchors.matsu.y).toBeLessThan(networkNodeAnchors['warehouse-a'].y);
    expect(networkNodeAnchors['green-island'].x).toBeGreaterThan(routeAnchors['taitung-gateway'].x);
    expect(networkNodeAnchors['green-island'].y).toBeGreaterThan(routeAnchors['taitung-gateway'].y);
    expect(islandGeometry.greenIsland).toContain('Z');
    const greenRoute=offshoreRoutes.find(route=>route.id==='green-island-link');
    expect(greenRoute?.from).toBe('taitung-gateway');
    expect(greenRoute?.to).toBe('green-island');
  });
});
