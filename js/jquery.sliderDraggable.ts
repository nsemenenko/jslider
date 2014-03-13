/**
 * Created by davidatborresen on 31.01.14.
 */

/// <reference path="../definitions/jquery/jquery.d.ts" />
/// <reference path="../definitions/hammer/hammerjs.d.ts" />
/// <reference path="jquery.slider.ts" />

interface ICoordinates
{
    x:number;
    y:number;
}

interface IInteractionType
{
    drag:boolean;
    clicked:boolean;
    toclick:boolean;
    mouseup:boolean;
}

interface IOffset
{
    top:number;
    left:number;
}

class SliderDraggable {

    public static EVENT_NAMESPACE:string = '.sliderDraggable';
    public static EVENT_CLICK:string = 'click';
    public static EVENT_UP:string = 'up';
    public static EVENT_MOVE:string = 'move';
    public static EVENT_DOWN:string = 'down';

    public pointer:JQuery;
    private outer:JQuery;
    private defaultIs:IInteractionType = {
        drag: false,
        clicked: false,
        toclick: true,
        mouseup: false
    };
    private is:IInteractionType;
    private events:Object;
    private cursorX:number;
    private cursorY:number;
    private d:Object;

    /**
     * @param pointer {HTMLElement}
     * @param uid {number}
     * @param slider {Slider}
     */
    constructor(pointer:HTMLElement, uid:any, slider:Slider)
    {
        this.init(pointer);
        this.onInit(pointer, uid, slider);
    }

    /**
     * @param pointer {HTMLElement}
     */
    private init(pointer:HTMLElement):void
    {
        if(arguments.length > 0)
        {
            this.pointer = jQuery(pointer);
            this.outer = jQuery('.draggable-outer');
        }

        var offset:IOffset = this.getPointerOffset();

        this.is = jQuery.extend(this.is, this.defaultIs);

        this.d = {
            left: offset.left,
            top: offset.top,
            width: this.pointer.width(),
            height: this.pointer.height()
        };

        this.events = {
            down: 'touch',
            move: 'drag',
            up  : 'release',
            click: 'tap'
        };

        this.setupEvents();
    }

    private setupEvents():void
    {
        this.bind(jQuery(document), SliderDraggable.EVENT_MOVE, (event:HammerEvent)=>
        {
            if (this.is.drag)
            {
                event.gesture.preventDefault();
                event.gesture.stopPropagation();

                this.mouseMove(event);
            }
        });

        this.bind(jQuery(document), SliderDraggable.EVENT_DOWN, (event:HammerEvent)=>
        {
            if(this.is.drag)
            {
                event.gesture.preventDefault();
                event.gesture.stopPropagation();
            }
        });

        this.bind(this.pointer, SliderDraggable.EVENT_MOVE, (event:HammerEvent)=>
        {
            if(this.is.drag)
            {
                event.gesture.preventDefault();
                event.gesture.stopPropagation();

                this.mouseMove(event);
            }
        });

        this.bind(this.pointer, SliderDraggable.EVENT_DOWN, (event:HammerEvent)=>
        {
            this.mouseDown(event);
            return false;
        });

        this.bind(this.pointer, SliderDraggable.EVENT_UP, (event:HammerEvent)=>
        {
            this.mouseUp(event);
        });

        this.bind(this.pointer, SliderDraggable.EVENT_CLICK, ()=>
        {
            this.is.clicked = true;

            if(!this.is.toclick)
            {
                this.is.toclick = true;
                return false;
            }

            return true;
        });
    }

    /**
     * @param event {JQueryEventObject}
     * @returns {{x: number, y: number}}
     */
    public getPageCoords(event:HammerEvent):ICoordinates
    {
        var touchList = event.gesture.touches;
        return {
            x: touchList[0].pageX,
            y: touchList[0].pageY
        };
    }

    /**
     * @returns {{left: number, top: number}}
     */
    public getPointerOffset():IOffset
    {
        return this.pointer.offset();
    }

    /**
     * @todo find out why event namespace doesnt work
     */
    private unbind():void
    {
        for(var eventType in this.events)
        {
            var namespacedEvent:string = this.events[eventType]; // + SliderDraggable.EVENT_NAMESPACE
            jQuery(document).hammer().off(namespacedEvent);
            this.pointer.hammer().off(namespacedEvent);
        }
    }

    /**
     * @param element
     * @param eventType
     * @param callback
     * @todo find out why event namespace doesnt work
     */
    private bind(element:JQuery, eventType:string, callback:(event:HammerEvent)=>void):void
    {
        var namespacedEvent:string = this.events[eventType]; // + SliderDraggable.EVENT_NAMESPACE

        Hammer(element.get(0)).on(namespacedEvent, callback);
    }

    /**
     * @param event {Event}
     */
    public mouseDown(event:HammerEvent):void
    {
        this.is.drag = true;
        this.is.mouseup = this.is.clicked = false;

        var offset:IOffset = this.getPointerOffset(),
            coords:ICoordinates = this.getPageCoords(event);

        this.cursorX = coords.x - offset.left;
        this.cursorY = coords.y - offset.top;

        this.d = jQuery.extend(this.d,{
            left:offset.left,
            top:offset.top,
            width:this.pointer.width(),
            height:this.pointer.height()
        });


        if(this.outer.length > 0)
        {
            this.outer.css({
                height: Math.max(this.outer.height(), jQuery(document.body).height()),
                overflow: 'hidden'
            });
        }

        this.onMouseDown(event);
    }

    /**
     * @param event {MouseEvent}
     */
    public mouseMove(event:HammerEvent):void
    {
        this.is.toclick = false;
        var coords = this.getPageCoords(event);
        this.onMouseMove(event, coords.x - this.cursorX, coords.y - this.cursorY);
    }

    /**
     * @param event {MouseEvent}
     */
    public mouseUp(event:HammerEvent):void
    {
        if(!this.is.drag)
        {
            return;
        }

        this.is.drag = false;

        if(this.outer.length > 0 && (navigator.userAgent.indexOf('compatible') < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/i.test(navigator.userAgent)))
        {
            this.outer.css({overflow:'hidden'});
        }
        else
        {
            this.outer.css({overflow:'visible'});
        }

        this.onMouseUp(event);
    }

    /**
     * @param pointer
     * @param id
     * @param constructor
     */
    public onInit(pointer:HTMLElement,id:number, constructor:Slider):void
    {}

    /**
     * @param event {MouseEvent}
     */
    public onMouseDown(event:HammerEvent):void
    {
        this.pointer.css({ position: 'absolute' });
    }

    /**
     * @param event {MouseEvent}
     * @param x {number}
     * @param y {number}
     */
    public onMouseMove(event:HammerEvent, x:number = null, y:number = null):void
    {}

    /**
     * @param event {MouseEvent}
     */
    public onMouseUp(event:HammerEvent):void
    {}

    public destroy():void
    {
        this.unbind();
        this.pointer.remove();
    }
}