"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ThreadFilterType = exports.ThreadEvent = exports.Thread = exports.THREAD_RELATION_TYPE = exports.FILTER_RELATED_BY_SENDERS = exports.FILTER_RELATED_BY_REL_TYPES = void 0;

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

var _matrix = require("../matrix");

var _ReEmitter = require("../ReEmitter");

var _event = require("./event");

var _eventTimeline = require("./event-timeline");

var _eventTimelineSet = require("./event-timeline-set");

var _typedEventEmitter = require("./typed-event-emitter");

var _NamespacedValue = require("../NamespacedValue");

var _logger = require("../logger");

/*
Copyright 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
let ThreadEvent;
exports.ThreadEvent = ThreadEvent;

(function (ThreadEvent) {
  ThreadEvent["New"] = "Thread.new";
  ThreadEvent["Update"] = "Thread.update";
  ThreadEvent["NewReply"] = "Thread.newReply";
  ThreadEvent["ViewThread"] = "Thread.viewThread";
})(ThreadEvent || (exports.ThreadEvent = ThreadEvent = {}));

/**
 * @experimental
 */
class Thread extends _typedEventEmitter.TypedEventEmitter {
  /**
   * A reference to all the events ID at the bottom of the threads
   */
  constructor(rootEvent, opts) {
    var _rootEvent$getId, _opts$initialEvents, _opts$initialEvents$f, _opts$initialEvents2;

    super();
    this.rootEvent = rootEvent;
    (0, _defineProperty2.default)(this, "timelineSet", void 0);
    (0, _defineProperty2.default)(this, "_currentUserParticipated", false);
    (0, _defineProperty2.default)(this, "reEmitter", void 0);
    (0, _defineProperty2.default)(this, "lastEvent", void 0);
    (0, _defineProperty2.default)(this, "replyCount", 0);
    (0, _defineProperty2.default)(this, "room", void 0);
    (0, _defineProperty2.default)(this, "client", void 0);
    (0, _defineProperty2.default)(this, "initialEventsFetched", false);
    (0, _defineProperty2.default)(this, "id", void 0);
    (0, _defineProperty2.default)(this, "onBeforeRedaction", (event, redaction) => {
      if (event !== null && event !== void 0 && event.isRelation(THREAD_RELATION_TYPE.name) && this.room.eventShouldLiveIn(event).threadId === this.id && event.getId() !== this.id && // the root event isn't counted in the length so ignore this redaction
      !redaction.status // only respect it when it succeeds
      ) {
        this.replyCount--;
        this.emit(ThreadEvent.Update, this);
      }
    });
    (0, _defineProperty2.default)(this, "onRedaction", event => {
      var _events$find;

      if (event.threadRootId !== this.id) return; // ignore redactions for other timelines

      const events = [...this.timelineSet.getLiveTimeline().getEvents()].reverse();
      this.lastEvent = (_events$find = events.find(e => !e.isRedacted() && e.isRelation(THREAD_RELATION_TYPE.name))) !== null && _events$find !== void 0 ? _events$find : this.rootEvent;
      this.emit(ThreadEvent.Update, this);
    });
    (0, _defineProperty2.default)(this, "onEcho", event => {
      if (event.threadRootId !== this.id) return; // ignore echoes for other timelines

      if (this.lastEvent === event) return; // There is a risk that the `localTimestamp` approximation will not be accurate
      // when threads are used over federation. That could result in the reply
      // count value drifting away from the value returned by the server

      const isThreadReply = event.isRelation(THREAD_RELATION_TYPE.name);

      if (!this.lastEvent || this.lastEvent.isRedacted() || isThreadReply && event.getId() !== this.lastEvent.getId() && event.localTimestamp > this.lastEvent.localTimestamp) {
        this.lastEvent = event;

        if (this.lastEvent.getId() !== this.id) {
          // This counting only works when server side support is enabled as we started the counting
          // from the value returned within the bundled relationship
          if (Thread.hasServerSideSupport) {
            this.replyCount++;
          }

          this.emit(ThreadEvent.NewReply, this, event);
        }
      }

      this.emit(ThreadEvent.Update, this);
    });
    this.room = opts.room;
    this.client = opts.client;
    this.timelineSet = new _eventTimelineSet.EventTimelineSet(this.room, {
      unstableClientRelationAggregation: true,
      timelineSupport: true,
      pendingEvents: true
    });
    this.reEmitter = new _ReEmitter.TypedReEmitter(this);
    this.reEmitter.reEmit(this.timelineSet, [_matrix.RoomEvent.Timeline, _matrix.RoomEvent.TimelineReset]);
    this.room.on(_matrix.MatrixEventEvent.BeforeRedaction, this.onBeforeRedaction);
    this.room.on(_matrix.RoomEvent.Redaction, this.onRedaction);
    this.room.on(_matrix.RoomEvent.LocalEchoUpdated, this.onEcho);
    this.timelineSet.on(_matrix.RoomEvent.Timeline, this.onEcho); // If we weren't able to find the root event, it's probably missing,
    // and we define the thread ID from one of the thread relation

    this.id = (_rootEvent$getId = rootEvent === null || rootEvent === void 0 ? void 0 : rootEvent.getId()) !== null && _rootEvent$getId !== void 0 ? _rootEvent$getId : opts === null || opts === void 0 ? void 0 : (_opts$initialEvents = opts.initialEvents) === null || _opts$initialEvents === void 0 ? void 0 : (_opts$initialEvents$f = _opts$initialEvents.find(event => event.isThreadRelation)) === null || _opts$initialEvents$f === void 0 ? void 0 : _opts$initialEvents$f.relationEventId;
    this.initialiseThread(this.rootEvent);
    opts === null || opts === void 0 ? void 0 : (_opts$initialEvents2 = opts.initialEvents) === null || _opts$initialEvents2 === void 0 ? void 0 : _opts$initialEvents2.forEach(event => this.addEvent(event, false));
  }

  static setServerSideSupport(hasServerSideSupport, useStable) {
    Thread.hasServerSideSupport = hasServerSideSupport;

    if (!useStable) {
      FILTER_RELATED_BY_SENDERS.setPreferUnstable(true);
      FILTER_RELATED_BY_REL_TYPES.setPreferUnstable(true);
      THREAD_RELATION_TYPE.setPreferUnstable(true);
    }
  }

  get roomState() {
    return this.room.getLiveTimeline().getState(_eventTimeline.EventTimeline.FORWARDS);
  }

  addEventToTimeline(event, toStartOfTimeline) {
    if (!this.findEventById(event.getId())) {
      this.timelineSet.addEventToTimeline(event, this.liveTimeline, toStartOfTimeline, false, this.roomState);
    }
  }
  /**
   * Add an event to the thread and updates
   * the tail/root references if needed
   * Will fire "Thread.update"
   * @param event The event to add
   * @param {boolean} toStartOfTimeline whether the event is being added
   * to the start (and not the end) of the timeline.
   */


  async addEvent(event, toStartOfTimeline) {
    // Add all incoming events to the thread's timeline set when there's  no server support
    if (!Thread.hasServerSideSupport) {
      // all the relevant membership info to hydrate events with a sender
      // is held in the main room timeline
      // We want to fetch the room state from there and pass it down to this thread
      // timeline set to let it reconcile an event with its relevant RoomMember
      event.setThread(this);
      this.addEventToTimeline(event, toStartOfTimeline);
      await this.client.decryptEventIfNeeded(event, {});
    } else if (!toStartOfTimeline && this.initialEventsFetched && event.localTimestamp > this.lastReply().localTimestamp) {
      await this.fetchEditsWhereNeeded(event);
      this.addEventToTimeline(event, false);
    }

    if (!this._currentUserParticipated && event.getSender() === this.client.getUserId()) {
      this._currentUserParticipated = true;
    } // If no thread support exists we want to count all thread relation
    // added as a reply. We can't rely on the bundled relationships count


    if (!Thread.hasServerSideSupport && event.isRelation(THREAD_RELATION_TYPE.name)) {
      this.replyCount++;
    }

    this.emit(ThreadEvent.Update, this);
  }

  initialiseThread(rootEvent) {
    const bundledRelationship = rootEvent === null || rootEvent === void 0 ? void 0 : rootEvent.getServerAggregatedRelation(THREAD_RELATION_TYPE.name);

    if (Thread.hasServerSideSupport && bundledRelationship) {
      this.replyCount = bundledRelationship.count;
      this._currentUserParticipated = bundledRelationship.current_user_participated;
      const event = new _event.MatrixEvent(bundledRelationship.latest_event);
      this.setEventMetadata(event);
      event.setThread(this);
      this.lastEvent = event;
      this.fetchEditsWhereNeeded(event);
    }
  } // XXX: Workaround for https://github.com/matrix-org/matrix-spec-proposals/pull/2676/files#r827240084


  async fetchEditsWhereNeeded(...events) {
    return Promise.all(events.filter(e => e.isEncrypted()).map(event => {
      return this.client.relations(this.roomId, event.getId(), _matrix.RelationType.Replace, event.getType(), {
        limit: 1
      }).then(relations => {
        if (relations.events.length) {
          event.makeReplaced(relations.events[0]);
        }
      }).catch(e => {
        _logger.logger.error("Failed to load edits for encrypted thread event", e);
      });
    }));
  }

  async fetchInitialEvents() {
    if (!Thread.hasServerSideSupport) {
      this.initialEventsFetched = true;
      return null;
    }

    try {
      const response = await this.fetchEvents();
      this.initialEventsFetched = true;
      return response;
    } catch (e) {
      return null;
    }
  }

  setEventMetadata(event) {
    _eventTimeline.EventTimeline.setEventMetadata(event, this.roomState, false);

    event.setThread(this);
  }
  /**
   * Finds an event by ID in the current thread
   */


  findEventById(eventId) {
    var _this$lastEvent;

    // Check the lastEvent as it may have been created based on a bundled relationship and not in a timeline
    if (((_this$lastEvent = this.lastEvent) === null || _this$lastEvent === void 0 ? void 0 : _this$lastEvent.getId()) === eventId) {
      return this.lastEvent;
    }

    return this.timelineSet.findEventById(eventId);
  }
  /**
   * Return last reply to the thread
   */


  lastReply(matches = () => true) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];

      if (matches(event)) {
        return event;
      }
    }
  }

  get roomId() {
    return this.room.roomId;
  }
  /**
   * The number of messages in the thread
   * Only count rel_type=m.thread as we want to
   * exclude annotations from that number
   */


  get length() {
    return this.replyCount;
  }
  /**
   * A getter for the last event added to the thread
   */


  get replyToEvent() {
    return this.lastEvent;
  }

  get events() {
    return this.liveTimeline.getEvents();
  }

  has(eventId) {
    return this.timelineSet.findEventById(eventId) instanceof _event.MatrixEvent;
  }

  get hasCurrentUserParticipated() {
    return this._currentUserParticipated;
  }

  get liveTimeline() {
    return this.timelineSet.getLiveTimeline();
  }

  async fetchEvents(opts = {
    limit: 20
  }) {
    let {
      originalEvent,
      events,
      prevBatch,
      nextBatch
    } = await this.client.relations(this.room.roomId, this.id, THREAD_RELATION_TYPE.name, null, opts); // When there's no nextBatch returned with a `from` request we have reached
    // the end of the thread, and therefore want to return an empty one

    if (!opts.to && !nextBatch) {
      events = [...events, originalEvent];
    }

    await this.fetchEditsWhereNeeded(...events);
    await Promise.all(events.map(event => {
      this.setEventMetadata(event);
      return this.client.decryptEventIfNeeded(event);
    }));
    const prependEvents = !opts.direction || opts.direction === _eventTimeline.Direction.Backward;
    this.timelineSet.addEventsToTimeline(events, prependEvents, this.liveTimeline, prependEvents ? nextBatch : prevBatch);
    return {
      originalEvent,
      events,
      prevBatch,
      nextBatch
    };
  }

}

exports.Thread = Thread;
(0, _defineProperty2.default)(Thread, "hasServerSideSupport", void 0);
const FILTER_RELATED_BY_SENDERS = new _NamespacedValue.ServerControlledNamespacedValue("related_by_senders", "io.element.relation_senders");
exports.FILTER_RELATED_BY_SENDERS = FILTER_RELATED_BY_SENDERS;
const FILTER_RELATED_BY_REL_TYPES = new _NamespacedValue.ServerControlledNamespacedValue("related_by_rel_types", "io.element.relation_types");
exports.FILTER_RELATED_BY_REL_TYPES = FILTER_RELATED_BY_REL_TYPES;
const THREAD_RELATION_TYPE = new _NamespacedValue.ServerControlledNamespacedValue("m.thread", "io.element.thread");
exports.THREAD_RELATION_TYPE = THREAD_RELATION_TYPE;
let ThreadFilterType;
exports.ThreadFilterType = ThreadFilterType;

(function (ThreadFilterType) {
  ThreadFilterType[ThreadFilterType["My"] = 0] = "My";
  ThreadFilterType[ThreadFilterType["All"] = 1] = "All";
})(ThreadFilterType || (exports.ThreadFilterType = ThreadFilterType = {}));