import 'leaflet';

declare module 'leaflet' {
  interface PolylineDecoratorOptions {
    patterns: Array<{
      offset?: string | number;
      endOffset?: string | number;
      repeat: string | number;
      symbol: any;
    }>;
  }

  class PolylineDecorator extends FeatureGroup {
    constructor(
      paths: Polyline | Polyline[] | LatLngExpression[] | LatLngExpression[][],
      options?: PolylineDecoratorOptions,
    );
    setPaths(paths: Polyline | Polyline[] | LatLngExpression[] | LatLngExpression[][]): this;
    setPatterns(patterns: PolylineDecoratorOptions['patterns']): this;
  }

  function polylineDecorator(
    paths: Polyline | Polyline[] | LatLngExpression[] | LatLngExpression[][],
    options?: PolylineDecoratorOptions,
  ): PolylineDecorator;

  namespace Symbol {
    interface ArrowHeadOptions {
      pixelSize?: number;
      polygon?: boolean;
      pathOptions?: PathOptions;
      headAngle?: number;
    }
    function arrowHead(options?: ArrowHeadOptions): any;

    interface DashOptions {
      pixelSize?: number;
      pathOptions?: PathOptions;
    }
    function dash(options?: DashOptions): any;
  }
}

declare module 'leaflet-polylinedecorator' {}
