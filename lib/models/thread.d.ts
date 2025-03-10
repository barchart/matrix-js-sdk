import { MatrixClient, RoomEvent } from "../matrix";
import { IRelationsRequestOpts } from "../@types/requests";
import { MatrixEvent } from "./event";
import { EventTimeline } from "./event-timeline";
import { EventTimelineSet, EventTimelineSetHandlerMap } from './event-timeline-set';
import { Room } from './room';
import { TypedEventEmitter } from "./typed-event-emitter";
import { RoomState } from "./room-state";
import { ServerControlledNamespacedValue } from "../NamespacedValue";
export declare enum ThreadEvent {
    New = "Thread.new",
    Update = "Thread.update",
    NewReply = "Thread.newReply",
    ViewThread = "Thread.viewThread"
}
declare type EmittedEvents = Exclude<ThreadEvent, ThreadEvent.New> | RoomEvent.Timeline | RoomEvent.TimelineReset;
export declare type EventHandlerMap = {
    [ThreadEvent.Update]: (thread: Thread) => void;
    [ThreadEvent.NewReply]: (thread: Thread, event: MatrixEvent) => void;
    [ThreadEvent.ViewThread]: () => void;
} & EventTimelineSetHandlerMap;
interface IThreadOpts {
    initialEvents?: MatrixEvent[];
    room: Room;
    client: MatrixClient;
}
/**
 * @experimental
 */
export declare class Thread extends TypedEventEmitter<EmittedEvents, EventHandlerMap> {
    readonly rootEvent: MatrixEvent | undefined;
    static hasServerSideSupport: boolean;
    /**
     * A reference to all the events ID at the bottom of the threads
     */
    readonly timelineSet: EventTimelineSet;
    private _currentUserParticipated;
    private reEmitter;
    private lastEvent;
    private replyCount;
    readonly room: Room;
    readonly client: MatrixClient;
    initialEventsFetched: boolean;
    readonly id: string;
    constructor(rootEvent: MatrixEvent | undefined, opts: IThreadOpts);
    static setServerSideSupport(hasServerSideSupport: boolean, useStable: boolean): void;
    private onBeforeRedaction;
    private onRedaction;
    private onEcho;
    get roomState(): RoomState;
    private addEventToTimeline;
    /**
     * Add an event to the thread and updates
     * the tail/root references if needed
     * Will fire "Thread.update"
     * @param event The event to add
     * @param {boolean} toStartOfTimeline whether the event is being added
     * to the start (and not the end) of the timeline.
     */
    addEvent(event: MatrixEvent, toStartOfTimeline: boolean): Promise<void>;
    private initialiseThread;
    private fetchEditsWhereNeeded;
    fetchInitialEvents(): Promise<{
        originalEvent: MatrixEvent;
        events: MatrixEvent[];
        nextBatch?: string;
        prevBatch?: string;
    } | null>;
    private setEventMetadata;
    /**
     * Finds an event by ID in the current thread
     */
    findEventById(eventId: string): MatrixEvent;
    /**
     * Return last reply to the thread
     */
    lastReply(matches?: (ev: MatrixEvent) => boolean): MatrixEvent;
    get roomId(): string;
    /**
     * The number of messages in the thread
     * Only count rel_type=m.thread as we want to
     * exclude annotations from that number
     */
    get length(): number;
    /**
     * A getter for the last event added to the thread
     */
    get replyToEvent(): MatrixEvent;
    get events(): MatrixEvent[];
    has(eventId: string): boolean;
    get hasCurrentUserParticipated(): boolean;
    get liveTimeline(): EventTimeline;
    fetchEvents(opts?: IRelationsRequestOpts): Promise<{
        originalEvent: MatrixEvent;
        events: MatrixEvent[];
        nextBatch?: string;
        prevBatch?: string;
    }>;
}
export declare const FILTER_RELATED_BY_SENDERS: ServerControlledNamespacedValue<"related_by_senders", "io.element.relation_senders">;
export declare const FILTER_RELATED_BY_REL_TYPES: ServerControlledNamespacedValue<"related_by_rel_types", "io.element.relation_types">;
export declare const THREAD_RELATION_TYPE: ServerControlledNamespacedValue<"m.thread", "io.element.thread">;
export declare enum ThreadFilterType {
    "My" = 0,
    "All" = 1
}
export {};
//# sourceMappingURL=thread.d.ts.map