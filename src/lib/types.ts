export interface Route {
  Id: number;
  NId?: string; // National route ID (TPE routes only), used for ebus.gov.taipei API
  nameZh: string;
  nameEn: string;
  departureZh: string;
  destinationZh: string;
  goFirstBusTime: string;
  goLastBusTime: string;
  backFirstBusTime: string;
  backLastBusTime: string;
  peakHeadway: string;
  offPeakHeadway: string;
  holidayGoFirstBusTime?: string;
  holidayBackFirstBusTime?: string;
  holidayGoLastBusTime?: string;
  holidayBackLastBusTime?: string;
  holidayPeakHeadway?: string;
  holidayOffPeakHeadway?: string;
}

export interface Stop {
  Id: number;
  routeId: number;
  nameZh: string;
  nameEn: string;
  seqNo: number;
  goBack: string;
  longitude: string;
  latitude: string;
  stopLocationId: number;
}

export interface EstimateTime {
  RouteID: number;
  StopID: number;
  EstimateTime: string;
  GoBack: string;
}

export interface StopWithEstimate extends Stop {
  estimateTime?: string;
  estimateMinutes?: number;
  status: 'arriving' | 'soon' | 'waiting' | 'not-running';
  statusText: string;
}

export interface NearbyStop extends Stop {
  distance: number;
  routeName?: string;
  estimateTime?: string;
  estimateMinutes?: number;
  status: 'arriving' | 'soon' | 'waiting' | 'not-running';
  statusText: string;
}
