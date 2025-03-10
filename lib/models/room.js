"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RoomEvent = exports.Room = exports.NotificationCountType = void 0;

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

var _eventTimelineSet = require("./event-timeline-set");

var _eventTimeline = require("./event-timeline");

var _contentRepo = require("../content-repo");

var utils = _interopRequireWildcard(require("../utils"));

var _event = require("./event");

var _eventStatus = require("./event-status");

var _roomMember = require("./room-member");

var _roomSummary = require("./room-summary");

var _logger = require("../logger");

var _ReEmitter = require("../ReEmitter");

var _event2 = require("../@types/event");

var _client = require("../client");

var _filter = require("../filter");

var _thread = require("./thread");

var _typedEventEmitter = require("./typed-event-emitter");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { (0, _defineProperty2.default)(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

// These constants are used as sane defaults when the homeserver doesn't support
// the m.room_versions capability. In practice, KNOWN_SAFE_ROOM_VERSION should be
// the same as the common default room version whereas SAFE_ROOM_VERSIONS are the
// room versions which are considered okay for people to run without being asked
// to upgrade (ie: "stable"). Eventually, we should remove these when all homeservers
// return an m.room_versions capability.
const KNOWN_SAFE_ROOM_VERSION = '6';
const SAFE_ROOM_VERSIONS = ['1', '2', '3', '4', '5', '6'];

function synthesizeReceipt(userId, event, receiptType) {
  // console.log("synthesizing receipt for "+event.getId());
  return new _event.MatrixEvent({
    content: {
      [event.getId()]: {
        [receiptType]: {
          [userId]: {
            ts: event.getTs()
          }
        }
      }
    },
    type: "m.receipt",
    room_id: event.getRoomId()
  });
}

const ReceiptPairRealIndex = 0;
const ReceiptPairSyntheticIndex = 1; // We will only hold a synthetic receipt if we do not have a real receipt or the synthetic is newer.

// When inserting a visibility event affecting event `eventId`, we
// need to scan through existing visibility events for `eventId`.
// In theory, this could take an unlimited amount of time if:
//
// - the visibility event was sent by a moderator; and
// - `eventId` already has many visibility changes (usually, it should
//   be 2 or less); and
// - for some reason, the visibility changes are received out of order
//   (usually, this shouldn't happen at all).
//
// For this reason, we limit the number of events to scan through,
// expecting that a broken visibility change for a single event in
// an extremely uncommon case (possibly a DoS) is a small
// price to pay to keep matrix-js-sdk responsive.
const MAX_NUMBER_OF_VISIBILITY_EVENTS_TO_SCAN_THROUGH = 30;
let NotificationCountType;
exports.NotificationCountType = NotificationCountType;

(function (NotificationCountType) {
  NotificationCountType["Highlight"] = "highlight";
  NotificationCountType["Total"] = "total";
})(NotificationCountType || (exports.NotificationCountType = NotificationCountType = {}));

let RoomEvent;
exports.RoomEvent = RoomEvent;

(function (RoomEvent) {
  RoomEvent["MyMembership"] = "Room.myMembership";
  RoomEvent["Tags"] = "Room.tags";
  RoomEvent["AccountData"] = "Room.accountData";
  RoomEvent["Receipt"] = "Room.receipt";
  RoomEvent["Name"] = "Room.name";
  RoomEvent["Redaction"] = "Room.redaction";
  RoomEvent["RedactionCancelled"] = "Room.redactionCancelled";
  RoomEvent["LocalEchoUpdated"] = "Room.localEchoUpdated";
  RoomEvent["Timeline"] = "Room.timeline";
  RoomEvent["TimelineReset"] = "Room.timelineReset";
})(RoomEvent || (exports.RoomEvent = RoomEvent = {}));

class Room extends _typedEventEmitter.TypedEventEmitter {
  // Pending in-flight requests { string: MatrixEvent }
  // receipts should clobber based on receipt_type and user_id pairs hence
  // the form of this structure. This is sub-optimal for the exposed APIs
  // which pass in an event ID and get back some receipts, so we also store
  // a pre-cached list for this purpose.
  // { receipt_type: { user_id: IReceipt } }
  // { event_id: ICachedReceipt[] }
  // any filtered timeline sets we're maintaining for this room
  // filter_id: timelineSet
  // read by megolm via getter; boolean value - null indicates "use global value"
  // flags to stop logspam about missing m.room.create events
  // Map from threadId to pending Thread instance created by createThreadFetchRoot
  // XXX: These should be read-only

  /**
   * The human-readable display name for this room.
   */

  /**
   * The un-homoglyphed name for this room.
   */

  /**
   * Dict of room tags; the keys are the tag name and the values
   * are any metadata associated with the tag - e.g. { "fav" : { order: 1 } }
   */
  // $tagName: { $metadata: $value }

  /**
   * accountData Dict of per-room account_data events; the keys are the
   * event type and the values are the events.
   */
  // $eventType: $event

  /**
   * The room summary.
   */

  /**
   * A token which a data store can use to remember the state of the room.
   */
  // legacy fields

  /**
   * The live event timeline for this room, with the oldest event at index 0.
   * Present for backwards compatibility - prefer getLiveTimeline().getEvents()
   */

  /**
   * oldState The state of the room at the time of the oldest
   * event in the live timeline. Present for backwards compatibility -
   * prefer getLiveTimeline().getState(EventTimeline.BACKWARDS).
   */

  /**
   * currentState The state of the room at the time of the
   * newest event in the timeline. Present for backwards compatibility -
   * prefer getLiveTimeline().getState(EventTimeline.FORWARDS).
   */

  /**
   * @experimental
   */

  /**
   * A mapping of eventId to all visibility changes to apply
   * to the event, by chronological order, as per
   * https://github.com/matrix-org/matrix-doc/pull/3531
   *
   * # Invariants
   *
   * - within each list, all events are classed by
   *   chronological order;
   * - all events are events such that
   *  `asVisibilityEvent()` returns a non-null `IVisibilityChange`;
   * - within each list with key `eventId`, all events
   *   are in relation to `eventId`.
   *
   * @experimental
   */

  /**
   * Construct a new Room.
   *
   * <p>For a room, we store an ordered sequence of timelines, which may or may not
   * be continuous. Each timeline lists a series of events, as well as tracking
   * the room state at the start and the end of the timeline. It also tracks
   * forward and backward pagination tokens, as well as containing links to the
   * next timeline in the sequence.
   *
   * <p>There is one special timeline - the 'live' timeline, which represents the
   * timeline to which events are being added in real-time as they are received
   * from the /sync API. Note that you should not retain references to this
   * timeline - even if it is the current timeline right now, it may not remain
   * so if the server gives us a timeline gap in /sync.
   *
   * <p>In order that we can find events from their ids later, we also maintain a
   * map from event_id to timeline and index.
   *
   * @constructor
   * @alias module:models/room
   * @param {string} roomId Required. The ID of this room.
   * @param {MatrixClient} client Required. The client, used to lazy load members.
   * @param {string} myUserId Required. The ID of the syncing user.
   * @param {Object=} opts Configuration options
   * @param {*} opts.storageToken Optional. The token which a data store can use
   * to remember the state of the room. What this means is dependent on the store
   * implementation.
   *
   * @param {String=} opts.pendingEventOrdering Controls where pending messages
   * appear in a room's timeline. If "<b>chronological</b>", messages will appear
   * in the timeline when the call to <code>sendEvent</code> was made. If
   * "<b>detached</b>", pending messages will appear in a separate list,
   * accessible via {@link module:models/room#getPendingEvents}. Default:
   * "chronological".
   * @param {boolean} [opts.timelineSupport = false] Set to true to enable improved
   * timeline support.
   * @param {boolean} [opts.unstableClientRelationAggregation = false]
   * Optional. Set to true to enable client-side aggregation of event relations
   * via `EventTimelineSet#getRelationsForEvent`.
   * This feature is currently unstable and the API may change without notice.
   */
  constructor(roomId, client, myUserId, opts = {}) {
    super(); // In some cases, we add listeners for every displayed Matrix event, so it's
    // common to have quite a few more than the default limit.

    this.roomId = roomId;
    this.client = client;
    this.myUserId = myUserId;
    this.opts = opts;
    (0, _defineProperty2.default)(this, "reEmitter", void 0);
    (0, _defineProperty2.default)(this, "txnToEvent", {});
    (0, _defineProperty2.default)(this, "receipts", {});
    (0, _defineProperty2.default)(this, "receiptCacheByEventId", {});
    (0, _defineProperty2.default)(this, "notificationCounts", {});
    (0, _defineProperty2.default)(this, "timelineSets", void 0);
    (0, _defineProperty2.default)(this, "threadsTimelineSets", []);
    (0, _defineProperty2.default)(this, "filteredTimelineSets", {});
    (0, _defineProperty2.default)(this, "pendingEventList", void 0);
    (0, _defineProperty2.default)(this, "blacklistUnverifiedDevices", null);
    (0, _defineProperty2.default)(this, "selfMembership", null);
    (0, _defineProperty2.default)(this, "summaryHeroes", null);
    (0, _defineProperty2.default)(this, "getTypeWarning", false);
    (0, _defineProperty2.default)(this, "getVersionWarning", false);
    (0, _defineProperty2.default)(this, "membersPromise", void 0);
    (0, _defineProperty2.default)(this, "threadPromises", new Map());
    (0, _defineProperty2.default)(this, "name", void 0);
    (0, _defineProperty2.default)(this, "normalizedName", void 0);
    (0, _defineProperty2.default)(this, "tags", {});
    (0, _defineProperty2.default)(this, "accountData", {});
    (0, _defineProperty2.default)(this, "summary", null);
    (0, _defineProperty2.default)(this, "storageToken", void 0);
    (0, _defineProperty2.default)(this, "timeline", void 0);
    (0, _defineProperty2.default)(this, "oldState", void 0);
    (0, _defineProperty2.default)(this, "currentState", void 0);
    (0, _defineProperty2.default)(this, "threads", new Map());
    (0, _defineProperty2.default)(this, "lastThread", void 0);
    (0, _defineProperty2.default)(this, "visibilityEvents", new Map());
    (0, _defineProperty2.default)(this, "threadTimelineSetsPromise", null);
    (0, _defineProperty2.default)(this, "threadsReady", false);
    (0, _defineProperty2.default)(this, "applyRedaction", event => {
      if (event.isRedaction()) {
        const redactId = event.event.redacts; // if we know about this event, redact its contents now.

        const redactedEvent = this.findEventById(redactId);

        if (redactedEvent) {
          redactedEvent.makeRedacted(event); // If this is in the current state, replace it with the redacted version

          if (redactedEvent.isState()) {
            const currentStateEvent = this.currentState.getStateEvents(redactedEvent.getType(), redactedEvent.getStateKey());

            if (currentStateEvent.getId() === redactedEvent.getId()) {
              this.currentState.setStateEvents([redactedEvent]);
            }
          }

          this.emit(RoomEvent.Redaction, event, this); // TODO: we stash user displaynames (among other things) in
          // RoomMember objects which are then attached to other events
          // (in the sender and target fields). We should get those
          // RoomMember objects to update themselves when the events that
          // they are based on are changed.
          // Remove any visibility change on this event.

          this.visibilityEvents.delete(redactId); // If this event is a visibility change event, remove it from the
          // list of visibility changes and update any event affected by it.

          if (redactedEvent.isVisibilityEvent()) {
            this.redactVisibilityChangeEvent(event);
          }
        } // FIXME: apply redactions to notification list
        // NB: We continue to add the redaction event to the timeline so
        // clients can say "so and so redacted an event" if they wish to. Also
        // this may be needed to trigger an update.

      }
    });
    this.setMaxListeners(100);
    this.reEmitter = new _ReEmitter.TypedReEmitter(this);
    opts.pendingEventOrdering = opts.pendingEventOrdering || _client.PendingEventOrdering.Chronological;
    this.name = roomId; // all our per-room timeline sets. the first one is the unfiltered ones;
    // the subsequent ones are the filtered ones in no particular order.

    this.timelineSets = [new _eventTimelineSet.EventTimelineSet(this, opts)];
    this.reEmitter.reEmit(this.getUnfilteredTimelineSet(), [RoomEvent.Timeline, RoomEvent.TimelineReset]);
    this.fixUpLegacyTimelineFields();

    if (this.opts.pendingEventOrdering === _client.PendingEventOrdering.Detached) {
      this.pendingEventList = [];
      const serializedPendingEventList = client.sessionStore.store.getItem(pendingEventsKey(this.roomId));

      if (serializedPendingEventList) {
        JSON.parse(serializedPendingEventList).forEach(async serializedEvent => {
          const event = new _event.MatrixEvent(serializedEvent);

          if (event.getType() === _event2.EventType.RoomMessageEncrypted) {
            await event.attemptDecryption(this.client.crypto);
          }

          event.setStatus(_eventStatus.EventStatus.NOT_SENT);
          this.addPendingEvent(event, event.getTxnId());
        });
      }
    } // awaited by getEncryptionTargetMembers while room members are loading


    if (!this.opts.lazyLoadMembers) {
      this.membersPromise = Promise.resolve(false);
    } else {
      this.membersPromise = null;
    }
  }

  async createThreadsTimelineSets() {
    var _this$client;

    if (this.threadTimelineSetsPromise) {
      return this.threadTimelineSetsPromise;
    }

    if ((_this$client = this.client) !== null && _this$client !== void 0 && _this$client.supportsExperimentalThreads()) {
      try {
        this.threadTimelineSetsPromise = Promise.all([this.createThreadTimelineSet(), this.createThreadTimelineSet(_thread.ThreadFilterType.My)]);
        const timelineSets = await this.threadTimelineSetsPromise;
        this.threadsTimelineSets.push(...timelineSets);
      } catch (e) {
        this.threadTimelineSetsPromise = null;
      }
    }
  }
  /**
   * Bulk decrypt critical events in a room
   *
   * Critical events represents the minimal set of events to decrypt
   * for a typical UI to function properly
   *
   * - Last event of every room (to generate likely message preview)
   * - All events up to the read receipt (to calculate an accurate notification count)
   *
   * @returns {Promise} Signals when all events have been decrypted
   */


  decryptCriticalEvents() {
    const readReceiptEventId = this.getEventReadUpTo(this.client.getUserId(), true);
    const events = this.getLiveTimeline().getEvents();
    const readReceiptTimelineIndex = events.findIndex(matrixEvent => {
      return matrixEvent.event.event_id === readReceiptEventId;
    });
    const decryptionPromises = events.slice(readReceiptTimelineIndex).filter(event => event.shouldAttemptDecryption()).reverse().map(event => event.attemptDecryption(this.client.crypto, {
      isRetry: true
    }));
    return Promise.allSettled(decryptionPromises);
  }
  /**
   * Bulk decrypt events in a room
   *
   * @returns {Promise} Signals when all events have been decrypted
   */


  decryptAllEvents() {
    const decryptionPromises = this.getUnfilteredTimelineSet().getLiveTimeline().getEvents().filter(event => event.shouldAttemptDecryption()).reverse().map(event => event.attemptDecryption(this.client.crypto, {
      isRetry: true
    }));
    return Promise.allSettled(decryptionPromises);
  }
  /**
   * Gets the version of the room
   * @returns {string} The version of the room, or null if it could not be determined
   */


  getVersion() {
    const createEvent = this.currentState.getStateEvents(_event2.EventType.RoomCreate, "");

    if (!createEvent) {
      if (!this.getVersionWarning) {
        _logger.logger.warn("[getVersion] Room " + this.roomId + " does not have an m.room.create event");

        this.getVersionWarning = true;
      }

      return '1';
    }

    const ver = createEvent.getContent()['room_version'];
    if (ver === undefined) return '1';
    return ver;
  }
  /**
   * Determines whether this room needs to be upgraded to a new version
   * @returns {string?} What version the room should be upgraded to, or null if
   *     the room does not require upgrading at this time.
   * @deprecated Use #getRecommendedVersion() instead
   */


  shouldUpgradeToVersion() {
    // TODO: Remove this function.
    // This makes assumptions about which versions are safe, and can easily
    // be wrong. Instead, people are encouraged to use getRecommendedVersion
    // which determines a safer value. This function doesn't use that function
    // because this is not async-capable, and to avoid breaking the contract
    // we're deprecating this.
    if (!SAFE_ROOM_VERSIONS.includes(this.getVersion())) {
      return KNOWN_SAFE_ROOM_VERSION;
    }

    return null;
  }
  /**
   * Determines the recommended room version for the room. This returns an
   * object with 3 properties: <code>version</code> as the new version the
   * room should be upgraded to (may be the same as the current version);
   * <code>needsUpgrade</code> to indicate if the room actually can be
   * upgraded (ie: does the current version not match?); and <code>urgent</code>
   * to indicate if the new version patches a vulnerability in a previous
   * version.
   * @returns {Promise<{version: string, needsUpgrade: boolean, urgent: boolean}>}
   * Resolves to the version the room should be upgraded to.
   */


  async getRecommendedVersion() {
    const capabilities = await this.client.getCapabilities();
    let versionCap = capabilities["m.room_versions"];

    if (!versionCap) {
      versionCap = {
        default: KNOWN_SAFE_ROOM_VERSION,
        available: {}
      };

      for (const safeVer of SAFE_ROOM_VERSIONS) {
        versionCap.available[safeVer] = _client.RoomVersionStability.Stable;
      }
    }

    let result = this.checkVersionAgainstCapability(versionCap);

    if (result.urgent && result.needsUpgrade) {
      // Something doesn't feel right: we shouldn't need to update
      // because the version we're on should be in the protocol's
      // namespace. This usually means that the server was updated
      // before the client was, making us think the newest possible
      // room version is not stable. As a solution, we'll refresh
      // the capability we're using to determine this.
      _logger.logger.warn("Refreshing room version capability because the server looks " + "to be supporting a newer room version we don't know about.");

      const caps = await this.client.getCapabilities(true);
      versionCap = caps["m.room_versions"];

      if (!versionCap) {
        _logger.logger.warn("No room version capability - assuming upgrade required.");

        return result;
      } else {
        result = this.checkVersionAgainstCapability(versionCap);
      }
    }

    return result;
  }

  checkVersionAgainstCapability(versionCap) {
    const currentVersion = this.getVersion();

    _logger.logger.log(`[${this.roomId}] Current version: ${currentVersion}`);

    _logger.logger.log(`[${this.roomId}] Version capability: `, versionCap);

    const result = {
      version: currentVersion,
      needsUpgrade: false,
      urgent: false
    }; // If the room is on the default version then nothing needs to change

    if (currentVersion === versionCap.default) return result;
    const stableVersions = Object.keys(versionCap.available).filter(v => versionCap.available[v] === 'stable'); // Check if the room is on an unstable version. We determine urgency based
    // off the version being in the Matrix spec namespace or not (if the version
    // is in the current namespace and unstable, the room is probably vulnerable).

    if (!stableVersions.includes(currentVersion)) {
      result.version = versionCap.default;
      result.needsUpgrade = true;
      result.urgent = !!this.getVersion().match(/^[0-9]+[0-9.]*$/g);

      if (result.urgent) {
        _logger.logger.warn(`URGENT upgrade required on ${this.roomId}`);
      } else {
        _logger.logger.warn(`Non-urgent upgrade required on ${this.roomId}`);
      }

      return result;
    } // The room is on a stable, but non-default, version by this point.
    // No upgrade needed.


    return result;
  }
  /**
   * Determines whether the given user is permitted to perform a room upgrade
   * @param {String} userId The ID of the user to test against
   * @returns {boolean} True if the given user is permitted to upgrade the room
   */


  userMayUpgradeRoom(userId) {
    return this.currentState.maySendStateEvent(_event2.EventType.RoomTombstone, userId);
  }
  /**
   * Get the list of pending sent events for this room
   *
   * @return {module:models/event.MatrixEvent[]} A list of the sent events
   * waiting for remote echo.
   *
   * @throws If <code>opts.pendingEventOrdering</code> was not 'detached'
   */


  getPendingEvents() {
    if (this.opts.pendingEventOrdering !== _client.PendingEventOrdering.Detached) {
      throw new Error("Cannot call getPendingEvents with pendingEventOrdering == " + this.opts.pendingEventOrdering);
    }

    return this.pendingEventList;
  }
  /**
   * Removes a pending event for this room
   *
   * @param {string} eventId
   * @return {boolean} True if an element was removed.
   */


  removePendingEvent(eventId) {
    if (this.opts.pendingEventOrdering !== _client.PendingEventOrdering.Detached) {
      throw new Error("Cannot call removePendingEvent with pendingEventOrdering == " + this.opts.pendingEventOrdering);
    }

    const removed = utils.removeElement(this.pendingEventList, function (ev) {
      return ev.getId() == eventId;
    }, false);
    this.savePendingEvents();
    return removed;
  }
  /**
   * Check whether the pending event list contains a given event by ID.
   * If pending event ordering is not "detached" then this returns false.
   *
   * @param {string} eventId The event ID to check for.
   * @return {boolean}
   */


  hasPendingEvent(eventId) {
    if (this.opts.pendingEventOrdering !== _client.PendingEventOrdering.Detached) {
      return false;
    }

    return this.pendingEventList.some(event => event.getId() === eventId);
  }
  /**
   * Get a specific event from the pending event list, if configured, null otherwise.
   *
   * @param {string} eventId The event ID to check for.
   * @return {MatrixEvent}
   */


  getPendingEvent(eventId) {
    if (this.opts.pendingEventOrdering !== _client.PendingEventOrdering.Detached) {
      return null;
    }

    return this.pendingEventList.find(event => event.getId() === eventId);
  }
  /**
   * Get the live unfiltered timeline for this room.
   *
   * @return {module:models/event-timeline~EventTimeline} live timeline
   */


  getLiveTimeline() {
    return this.getUnfilteredTimelineSet().getLiveTimeline();
  }
  /**
   * Get the timestamp of the last message in the room
   *
   * @return {number} the timestamp of the last message in the room
   */


  getLastActiveTimestamp() {
    const timeline = this.getLiveTimeline();
    const events = timeline.getEvents();

    if (events.length) {
      const lastEvent = events[events.length - 1];
      return lastEvent.getTs();
    } else {
      return Number.MIN_SAFE_INTEGER;
    }
  }
  /**
   * @return {string} the membership type (join | leave | invite) for the logged in user
   */


  getMyMembership() {
    return this.selfMembership;
  }
  /**
   * If this room is a DM we're invited to,
   * try to find out who invited us
   * @return {string} user id of the inviter
   */


  getDMInviter() {
    if (this.myUserId) {
      const me = this.getMember(this.myUserId);

      if (me) {
        return me.getDMInviter();
      }
    }

    if (this.selfMembership === "invite") {
      // fall back to summary information
      const memberCount = this.getInvitedAndJoinedMemberCount();

      if (memberCount == 2 && this.summaryHeroes.length) {
        return this.summaryHeroes[0];
      }
    }
  }
  /**
   * Assuming this room is a DM room, tries to guess with which user.
   * @return {string} user id of the other member (could be syncing user)
   */


  guessDMUserId() {
    const me = this.getMember(this.myUserId);

    if (me) {
      const inviterId = me.getDMInviter();

      if (inviterId) {
        return inviterId;
      }
    } // remember, we're assuming this room is a DM,
    // so returning the first member we find should be fine


    const hasHeroes = Array.isArray(this.summaryHeroes) && this.summaryHeroes.length;

    if (hasHeroes) {
      return this.summaryHeroes[0];
    }

    const members = this.currentState.getMembers();
    const anyMember = members.find(m => m.userId !== this.myUserId);

    if (anyMember) {
      return anyMember.userId;
    } // it really seems like I'm the only user in the room
    // so I probably created a room with just me in it
    // and marked it as a DM. Ok then


    return this.myUserId;
  }

  getAvatarFallbackMember() {
    const memberCount = this.getInvitedAndJoinedMemberCount();

    if (memberCount > 2) {
      return;
    }

    const hasHeroes = Array.isArray(this.summaryHeroes) && this.summaryHeroes.length;

    if (hasHeroes) {
      const availableMember = this.summaryHeroes.map(userId => {
        return this.getMember(userId);
      }).find(member => !!member);

      if (availableMember) {
        return availableMember;
      }
    }

    const members = this.currentState.getMembers(); // could be different than memberCount
    // as this includes left members

    if (members.length <= 2) {
      const availableMember = members.find(m => {
        return m.userId !== this.myUserId;
      });

      if (availableMember) {
        return availableMember;
      }
    } // if all else fails, try falling back to a user,
    // and create a one-off member for it


    if (hasHeroes) {
      const availableUser = this.summaryHeroes.map(userId => {
        return this.client.getUser(userId);
      }).find(user => !!user);

      if (availableUser) {
        const member = new _roomMember.RoomMember(this.roomId, availableUser.userId);
        member.user = availableUser;
        return member;
      }
    }
  }
  /**
   * Sets the membership this room was received as during sync
   * @param {string} membership join | leave | invite
   */


  updateMyMembership(membership) {
    const prevMembership = this.selfMembership;
    this.selfMembership = membership;

    if (prevMembership !== membership) {
      if (membership === "leave") {
        this.cleanupAfterLeaving();
      }

      this.emit(RoomEvent.MyMembership, this, membership, prevMembership);
    }
  }

  async loadMembersFromServer() {
    const lastSyncToken = this.client.store.getSyncToken();
    const response = await this.client.members(this.roomId, undefined, "leave", lastSyncToken);
    return response.chunk;
  }

  async loadMembers() {
    // were the members loaded from the server?
    let fromServer = false;
    let rawMembersEvents = await this.client.store.getOutOfBandMembers(this.roomId); // If the room is encrypted, we always fetch members from the server at
    // least once, in case the latest state wasn't persisted properly. Note
    // that this function is only called once (unless loading the members
    // fails), since loadMembersIfNeeded always returns this.membersPromise
    // if set, which will be the result of the first (successful) call.

    if (rawMembersEvents === null || this.client.isCryptoEnabled() && this.client.isRoomEncrypted(this.roomId)) {
      fromServer = true;
      rawMembersEvents = await this.loadMembersFromServer();

      _logger.logger.log(`LL: got ${rawMembersEvents.length} ` + `members from server for room ${this.roomId}`);
    }

    const memberEvents = rawMembersEvents.map(this.client.getEventMapper());
    return {
      memberEvents,
      fromServer
    };
  }
  /**
   * Preloads the member list in case lazy loading
   * of memberships is in use. Can be called multiple times,
   * it will only preload once.
   * @return {Promise} when preloading is done and
   * accessing the members on the room will take
   * all members in the room into account
   */


  loadMembersIfNeeded() {
    if (this.membersPromise) {
      return this.membersPromise;
    } // mark the state so that incoming messages while
    // the request is in flight get marked as superseding
    // the OOB members


    this.currentState.markOutOfBandMembersStarted();
    const inMemoryUpdate = this.loadMembers().then(result => {
      this.currentState.setOutOfBandMembers(result.memberEvents); // now the members are loaded, start to track the e2e devices if needed

      if (this.client.isCryptoEnabled() && this.client.isRoomEncrypted(this.roomId)) {
        this.client.crypto.trackRoomDevices(this.roomId);
      }

      return result.fromServer;
    }).catch(err => {
      // allow retries on fail
      this.membersPromise = null;
      this.currentState.markOutOfBandMembersFailed();
      throw err;
    }); // update members in storage, but don't wait for it

    inMemoryUpdate.then(fromServer => {
      if (fromServer) {
        const oobMembers = this.currentState.getMembers().filter(m => m.isOutOfBand()).map(m => m.events.member.event);

        _logger.logger.log(`LL: telling store to write ${oobMembers.length}` + ` members for room ${this.roomId}`);

        const store = this.client.store;
        return store.setOutOfBandMembers(this.roomId, oobMembers) // swallow any IDB error as we don't want to fail
        // because of this
        .catch(err => {
          _logger.logger.log("LL: storing OOB room members failed, oh well", err);
        });
      }
    }).catch(err => {
      // as this is not awaited anywhere,
      // at least show the error in the console
      _logger.logger.error(err);
    });
    this.membersPromise = inMemoryUpdate;
    return this.membersPromise;
  }
  /**
   * Removes the lazily loaded members from storage if needed
   */


  async clearLoadedMembersIfNeeded() {
    if (this.opts.lazyLoadMembers && this.membersPromise) {
      await this.loadMembersIfNeeded();
      await this.client.store.clearOutOfBandMembers(this.roomId);
      this.currentState.clearOutOfBandMembers();
      this.membersPromise = null;
    }
  }
  /**
   * called when sync receives this room in the leave section
   * to do cleanup after leaving a room. Possibly called multiple times.
   */


  cleanupAfterLeaving() {
    this.clearLoadedMembersIfNeeded().catch(err => {
      _logger.logger.error(`error after clearing loaded members from ` + `room ${this.roomId} after leaving`);

      _logger.logger.log(err);
    });
  }
  /**
   * Reset the live timeline of all timelineSets, and start new ones.
   *
   * <p>This is used when /sync returns a 'limited' timeline.
   *
   * @param {string=} backPaginationToken   token for back-paginating the new timeline
   * @param {string=} forwardPaginationToken token for forward-paginating the old live timeline,
   * if absent or null, all timelines are reset, removing old ones (including the previous live
   * timeline which would otherwise be unable to paginate forwards without this token).
   * Removing just the old live timeline whilst preserving previous ones is not supported.
   */


  resetLiveTimeline(backPaginationToken, forwardPaginationToken) {
    for (let i = 0; i < this.timelineSets.length; i++) {
      this.timelineSets[i].resetLiveTimeline(backPaginationToken, forwardPaginationToken);
    }

    this.fixUpLegacyTimelineFields();
  }
  /**
   * Fix up this.timeline, this.oldState and this.currentState
   *
   * @private
   */


  fixUpLegacyTimelineFields() {
    // maintain this.timeline as a reference to the live timeline,
    // and this.oldState and this.currentState as references to the
    // state at the start and end of that timeline. These are more
    // for backwards-compatibility than anything else.
    this.timeline = this.getLiveTimeline().getEvents();
    this.oldState = this.getLiveTimeline().getState(_eventTimeline.EventTimeline.BACKWARDS);
    this.currentState = this.getLiveTimeline().getState(_eventTimeline.EventTimeline.FORWARDS);
  }
  /**
   * Returns whether there are any devices in the room that are unverified
   *
   * Note: Callers should first check if crypto is enabled on this device. If it is
   * disabled, then we aren't tracking room devices at all, so we can't answer this, and an
   * error will be thrown.
   *
   * @return {boolean} the result
   */


  async hasUnverifiedDevices() {
    if (!this.client.isRoomEncrypted(this.roomId)) {
      return false;
    }

    const e2eMembers = await this.getEncryptionTargetMembers();

    for (const member of e2eMembers) {
      const devices = this.client.getStoredDevicesForUser(member.userId);

      if (devices.some(device => device.isUnverified())) {
        return true;
      }
    }

    return false;
  }
  /**
   * Return the timeline sets for this room.
   * @return {EventTimelineSet[]} array of timeline sets for this room
   */


  getTimelineSets() {
    return this.timelineSets;
  }
  /**
   * Helper to return the main unfiltered timeline set for this room
   * @return {EventTimelineSet} room's unfiltered timeline set
   */


  getUnfilteredTimelineSet() {
    return this.timelineSets[0];
  }
  /**
   * Get the timeline which contains the given event from the unfiltered set, if any
   *
   * @param {string} eventId  event ID to look for
   * @return {?module:models/event-timeline~EventTimeline} timeline containing
   * the given event, or null if unknown
   */


  getTimelineForEvent(eventId) {
    const event = this.findEventById(eventId);
    const thread = this.findThreadForEvent(event);

    if (thread) {
      return thread.timelineSet.getLiveTimeline();
    } else {
      return this.getUnfilteredTimelineSet().getTimelineForEvent(eventId);
    }
  }
  /**
   * Add a new timeline to this room's unfiltered timeline set
   *
   * @return {module:models/event-timeline~EventTimeline} newly-created timeline
   */


  addTimeline() {
    return this.getUnfilteredTimelineSet().addTimeline();
  }
  /**
   * Get an event which is stored in our unfiltered timeline set, or in a thread
   *
   * @param {string} eventId event ID to look for
   * @return {?module:models/event.MatrixEvent} the given event, or undefined if unknown
   */


  findEventById(eventId) {
    let event = this.getUnfilteredTimelineSet().findEventById(eventId);

    if (!event) {
      const threads = this.getThreads();

      for (let i = 0; i < threads.length; i++) {
        const thread = threads[i];
        event = thread.findEventById(eventId);

        if (event) {
          return event;
        }
      }
    }

    return event;
  }
  /**
   * Get one of the notification counts for this room
   * @param {String} type The type of notification count to get. default: 'total'
   * @return {Number} The notification count, or undefined if there is no count
   *                  for this type.
   */


  getUnreadNotificationCount(type = NotificationCountType.Total) {
    return this.notificationCounts[type];
  }
  /**
   * Set one of the notification counts for this room
   * @param {String} type The type of notification count to set.
   * @param {Number} count The new count
   */


  setUnreadNotificationCount(type, count) {
    this.notificationCounts[type] = count;
  }

  setSummary(summary) {
    const heroes = summary["m.heroes"];
    const joinedCount = summary["m.joined_member_count"];
    const invitedCount = summary["m.invited_member_count"];

    if (Number.isInteger(joinedCount)) {
      this.currentState.setJoinedMemberCount(joinedCount);
    }

    if (Number.isInteger(invitedCount)) {
      this.currentState.setInvitedMemberCount(invitedCount);
    }

    if (Array.isArray(heroes)) {
      // be cautious about trusting server values,
      // and make sure heroes doesn't contain our own id
      // just to be sure
      this.summaryHeroes = heroes.filter(userId => {
        return userId !== this.myUserId;
      });
    }
  }
  /**
   * Whether to send encrypted messages to devices within this room.
   * @param {Boolean} value true to blacklist unverified devices, null
   * to use the global value for this room.
   */


  setBlacklistUnverifiedDevices(value) {
    this.blacklistUnverifiedDevices = value;
  }
  /**
   * Whether to send encrypted messages to devices within this room.
   * @return {Boolean} true if blacklisting unverified devices, null
   * if the global value should be used for this room.
   */


  getBlacklistUnverifiedDevices() {
    return this.blacklistUnverifiedDevices;
  }
  /**
   * Get the avatar URL for a room if one was set.
   * @param {String} baseUrl The homeserver base URL. See
   * {@link module:client~MatrixClient#getHomeserverUrl}.
   * @param {Number} width The desired width of the thumbnail.
   * @param {Number} height The desired height of the thumbnail.
   * @param {string} resizeMethod The thumbnail resize method to use, either
   * "crop" or "scale".
   * @param {boolean} allowDefault True to allow an identicon for this room if an
   * avatar URL wasn't explicitly set. Default: true. (Deprecated)
   * @return {?string} the avatar URL or null.
   */


  getAvatarUrl(baseUrl, width, height, resizeMethod, allowDefault = true) {
    const roomAvatarEvent = this.currentState.getStateEvents(_event2.EventType.RoomAvatar, "");

    if (!roomAvatarEvent && !allowDefault) {
      return null;
    }

    const mainUrl = roomAvatarEvent ? roomAvatarEvent.getContent().url : null;

    if (mainUrl) {
      return (0, _contentRepo.getHttpUriForMxc)(baseUrl, mainUrl, width, height, resizeMethod);
    }

    return null;
  }
  /**
   * Get the mxc avatar url for the room, if one was set.
   * @return {string} the mxc avatar url or falsy
   */


  getMxcAvatarUrl() {
    var _this$currentState$ge, _this$currentState$ge2;

    return ((_this$currentState$ge = this.currentState.getStateEvents(_event2.EventType.RoomAvatar, "")) === null || _this$currentState$ge === void 0 ? void 0 : (_this$currentState$ge2 = _this$currentState$ge.getContent()) === null || _this$currentState$ge2 === void 0 ? void 0 : _this$currentState$ge2.url) || null;
  }
  /**
   * Get the aliases this room has according to the room's state
   * The aliases returned by this function may not necessarily
   * still point to this room.
   * @return {array} The room's alias as an array of strings
   */


  getAliases() {
    const aliasStrings = [];
    const aliasEvents = this.currentState.getStateEvents(_event2.EventType.RoomAliases);

    if (aliasEvents) {
      for (let i = 0; i < aliasEvents.length; ++i) {
        const aliasEvent = aliasEvents[i];

        if (Array.isArray(aliasEvent.getContent().aliases)) {
          const filteredAliases = aliasEvent.getContent().aliases.filter(a => {
            if (typeof a !== "string") return false;
            if (a[0] !== '#') return false;
            if (!a.endsWith(`:${aliasEvent.getStateKey()}`)) return false; // It's probably valid by here.

            return true;
          });
          Array.prototype.push.apply(aliasStrings, filteredAliases);
        }
      }
    }

    return aliasStrings;
  }
  /**
   * Get this room's canonical alias
   * The alias returned by this function may not necessarily
   * still point to this room.
   * @return {?string} The room's canonical alias, or null if there is none
   */


  getCanonicalAlias() {
    const canonicalAlias = this.currentState.getStateEvents(_event2.EventType.RoomCanonicalAlias, "");

    if (canonicalAlias) {
      return canonicalAlias.getContent().alias || null;
    }

    return null;
  }
  /**
   * Get this room's alternative aliases
   * @return {array} The room's alternative aliases, or an empty array
   */


  getAltAliases() {
    const canonicalAlias = this.currentState.getStateEvents(_event2.EventType.RoomCanonicalAlias, "");

    if (canonicalAlias) {
      return canonicalAlias.getContent().alt_aliases || [];
    }

    return [];
  }
  /**
   * Add events to a timeline
   *
   * <p>Will fire "Room.timeline" for each event added.
   *
   * @param {MatrixEvent[]} events A list of events to add.
   *
   * @param {boolean} toStartOfTimeline   True to add these events to the start
   * (oldest) instead of the end (newest) of the timeline. If true, the oldest
   * event will be the <b>last</b> element of 'events'.
   *
   * @param {module:models/event-timeline~EventTimeline} timeline   timeline to
   *    add events to.
   *
   * @param {string=} paginationToken   token for the next batch of events
   *
   * @fires module:client~MatrixClient#event:"Room.timeline"
   *
   */


  addEventsToTimeline(events, toStartOfTimeline, timeline, paginationToken) {
    timeline.getTimelineSet().addEventsToTimeline(events, toStartOfTimeline, timeline, paginationToken);
  }
  /**
   * @experimental
   */


  getThread(eventId) {
    return this.getThreads().find(thread => {
      return thread.id === eventId;
    });
  }
  /**
   * @experimental
   */


  getThreads() {
    return Array.from(this.threads.values());
  }
  /**
   * Get a member from the current room state.
   * @param {string} userId The user ID of the member.
   * @return {RoomMember} The member or <code>null</code>.
   */


  getMember(userId) {
    return this.currentState.getMember(userId);
  }
  /**
   * Get all currently loaded members from the current
   * room state.
   * @returns {RoomMember[]} Room members
   */


  getMembers() {
    return this.currentState.getMembers();
  }
  /**
   * Get a list of members whose membership state is "join".
   * @return {RoomMember[]} A list of currently joined members.
   */


  getJoinedMembers() {
    return this.getMembersWithMembership("join");
  }
  /**
   * Returns the number of joined members in this room
   * This method caches the result.
   * This is a wrapper around the method of the same name in roomState, returning
   * its result for the room's current state.
   * @return {number} The number of members in this room whose membership is 'join'
   */


  getJoinedMemberCount() {
    return this.currentState.getJoinedMemberCount();
  }
  /**
   * Returns the number of invited members in this room
   * @return {number} The number of members in this room whose membership is 'invite'
   */


  getInvitedMemberCount() {
    return this.currentState.getInvitedMemberCount();
  }
  /**
   * Returns the number of invited + joined members in this room
   * @return {number} The number of members in this room whose membership is 'invite' or 'join'
   */


  getInvitedAndJoinedMemberCount() {
    return this.getInvitedMemberCount() + this.getJoinedMemberCount();
  }
  /**
   * Get a list of members with given membership state.
   * @param {string} membership The membership state.
   * @return {RoomMember[]} A list of members with the given membership state.
   */


  getMembersWithMembership(membership) {
    return this.currentState.getMembers().filter(function (m) {
      return m.membership === membership;
    });
  }
  /**
   * Get a list of members we should be encrypting for in this room
   * @return {Promise<RoomMember[]>} A list of members who
   * we should encrypt messages for in this room.
   */


  async getEncryptionTargetMembers() {
    await this.loadMembersIfNeeded();
    let members = this.getMembersWithMembership("join");

    if (this.shouldEncryptForInvitedMembers()) {
      members = members.concat(this.getMembersWithMembership("invite"));
    }

    return members;
  }
  /**
   * Determine whether we should encrypt messages for invited users in this room
   * @return {boolean} if we should encrypt messages for invited users
   */


  shouldEncryptForInvitedMembers() {
    var _ev$getContent;

    const ev = this.currentState.getStateEvents(_event2.EventType.RoomHistoryVisibility, "");
    return (ev === null || ev === void 0 ? void 0 : (_ev$getContent = ev.getContent()) === null || _ev$getContent === void 0 ? void 0 : _ev$getContent.history_visibility) !== "joined";
  }
  /**
   * Get the default room name (i.e. what a given user would see if the
   * room had no m.room.name)
   * @param {string} userId The userId from whose perspective we want
   * to calculate the default name
   * @return {string} The default room name
   */


  getDefaultRoomName(userId) {
    return this.calculateRoomName(userId, true);
  }
  /**
   * Check if the given user_id has the given membership state.
   * @param {string} userId The user ID to check.
   * @param {string} membership The membership e.g. <code>'join'</code>
   * @return {boolean} True if this user_id has the given membership state.
   */


  hasMembershipState(userId, membership) {
    const member = this.getMember(userId);

    if (!member) {
      return false;
    }

    return member.membership === membership;
  }
  /**
   * Add a timelineSet for this room with the given filter
   * @param {Filter} filter The filter to be applied to this timelineSet
   * @param {Object=} opts Configuration options
   * @param {*} opts.storageToken Optional.
   * @return {EventTimelineSet} The timelineSet
   */


  getOrCreateFilteredTimelineSet(filter, {
    prepopulateTimeline = true,
    useSyncEvents = true,
    pendingEvents = true
  } = {}) {
    if (this.filteredTimelineSets[filter.filterId]) {
      return this.filteredTimelineSets[filter.filterId];
    }

    const opts = Object.assign({
      filter,
      pendingEvents
    }, this.opts);
    const timelineSet = new _eventTimelineSet.EventTimelineSet(this, opts);
    this.reEmitter.reEmit(timelineSet, [RoomEvent.Timeline, RoomEvent.TimelineReset]);

    if (useSyncEvents) {
      this.filteredTimelineSets[filter.filterId] = timelineSet;
      this.timelineSets.push(timelineSet);
    }

    const unfilteredLiveTimeline = this.getLiveTimeline(); // Not all filter are possible to replicate client-side only
    // When that's the case we do not want to prepopulate from the live timeline
    // as we would get incorrect results compared to what the server would send back

    if (prepopulateTimeline) {
      // populate up the new timelineSet with filtered events from our live
      // unfiltered timeline.
      //
      // XXX: This is risky as our timeline
      // may have grown huge and so take a long time to filter.
      // see https://github.com/vector-im/vector-web/issues/2109
      unfilteredLiveTimeline.getEvents().forEach(function (event) {
        timelineSet.addLiveEvent(event);
      }); // find the earliest unfiltered timeline

      let timeline = unfilteredLiveTimeline;

      while (timeline.getNeighbouringTimeline(_eventTimeline.EventTimeline.BACKWARDS)) {
        timeline = timeline.getNeighbouringTimeline(_eventTimeline.EventTimeline.BACKWARDS);
      }

      timelineSet.getLiveTimeline().setPaginationToken(timeline.getPaginationToken(_eventTimeline.EventTimeline.BACKWARDS), _eventTimeline.EventTimeline.BACKWARDS);
    } else if (useSyncEvents) {
      const livePaginationToken = unfilteredLiveTimeline.getPaginationToken(_eventTimeline.Direction.Forward);
      timelineSet.getLiveTimeline().setPaginationToken(livePaginationToken, _eventTimeline.Direction.Backward);
    } // alternatively, we could try to do something like this to try and re-paginate
    // in the filtered events from nothing, but Mark says it's an abuse of the API
    // to do so:
    //
    // timelineSet.resetLiveTimeline(
    //      unfilteredLiveTimeline.getPaginationToken(EventTimeline.FORWARDS)
    // );


    return timelineSet;
  }

  async getThreadListFilter(filterType = _thread.ThreadFilterType.All) {
    const myUserId = this.client.getUserId();
    const filter = new _filter.Filter(myUserId);
    const definition = {
      "room": {
        "timeline": {
          [_thread.FILTER_RELATED_BY_REL_TYPES.name]: [_thread.THREAD_RELATION_TYPE.name]
        }
      }
    };

    if (filterType === _thread.ThreadFilterType.My) {
      definition.room.timeline[_thread.FILTER_RELATED_BY_SENDERS.name] = [myUserId];
    }

    filter.setDefinition(definition);
    const filterId = await this.client.getOrCreateFilter(`THREAD_PANEL_${this.roomId}_${filterType}`, filter);
    filter.filterId = filterId;
    return filter;
  }

  async createThreadTimelineSet(filterType) {
    let timelineSet;

    if (_thread.Thread.hasServerSideSupport) {
      const filter = await this.getThreadListFilter(filterType);
      timelineSet = this.getOrCreateFilteredTimelineSet(filter, {
        prepopulateTimeline: false,
        useSyncEvents: false,
        pendingEvents: false
      });
    } else {
      timelineSet = new _eventTimelineSet.EventTimelineSet(this, {
        pendingEvents: false
      });
      Array.from(this.threads).forEach(([, thread]) => {
        if (thread.length === 0) return;
        const currentUserParticipated = thread.events.some(event => {
          return event.getSender() === this.client.getUserId();
        });

        if (filterType !== _thread.ThreadFilterType.My || currentUserParticipated) {
          timelineSet.getLiveTimeline().addEvent(thread.rootEvent, false);
        }
      });
    }

    return timelineSet;
  }

  async fetchRoomThreads() {
    if (this.threadsReady || !this.client.supportsExperimentalThreads()) {
      return;
    }

    const allThreadsFilter = await this.getThreadListFilter();
    const {
      chunk: events
    } = await this.client.createMessagesRequest(this.roomId, "", Number.MAX_SAFE_INTEGER, _eventTimeline.Direction.Backward, allThreadsFilter);
    if (!events.length) return; // Sorted by last_reply origin_server_ts

    const threadRoots = events.map(this.client.getEventMapper()).sort((eventA, eventB) => {
      /**
       * `origin_server_ts` in a decentralised world is far from ideal
       * but for lack of any better, we will have to use this
       * Long term the sorting should be handled by homeservers and this
       * is only meant as a short term patch
       */
      const threadAMetadata = eventA.getServerAggregatedRelation(_event2.RelationType.Thread);
      const threadBMetadata = eventB.getServerAggregatedRelation(_event2.RelationType.Thread);
      return threadAMetadata.latest_event.origin_server_ts - threadBMetadata.latest_event.origin_server_ts;
    });
    let latestMyThreadsRootEvent;
    const roomState = this.getLiveTimeline().getState(_eventTimeline.EventTimeline.FORWARDS);

    for (const rootEvent of threadRoots) {
      this.threadsTimelineSets[0].addLiveEvent(rootEvent, _eventTimelineSet.DuplicateStrategy.Ignore, false, roomState);
      const threadRelationship = rootEvent.getServerAggregatedRelation(_event2.RelationType.Thread);

      if (threadRelationship.current_user_participated) {
        this.threadsTimelineSets[1].addLiveEvent(rootEvent, _eventTimelineSet.DuplicateStrategy.Ignore, false, roomState);
        latestMyThreadsRootEvent = rootEvent;
      }

      if (!this.getThread(rootEvent.getId())) {
        this.createThread(rootEvent, [], true);
      }
    }

    this.client.decryptEventIfNeeded(threadRoots[threadRoots.length - 1]);

    if (latestMyThreadsRootEvent) {
      this.client.decryptEventIfNeeded(latestMyThreadsRootEvent);
    }

    this.threadsReady = true;
    this.on(_thread.ThreadEvent.NewReply, this.onThreadNewReply);
  }

  onThreadNewReply(thread) {
    for (const timelineSet of this.threadsTimelineSets) {
      timelineSet.removeEvent(thread.id);
      timelineSet.addLiveEvent(thread.rootEvent);
    }
  }
  /**
   * Forget the timelineSet for this room with the given filter
   *
   * @param {Filter} filter the filter whose timelineSet is to be forgotten
   */


  removeFilteredTimelineSet(filter) {
    const timelineSet = this.filteredTimelineSets[filter.filterId];
    delete this.filteredTimelineSets[filter.filterId];
    const i = this.timelineSets.indexOf(timelineSet);

    if (i > -1) {
      this.timelineSets.splice(i, 1);
    }
  }

  eventShouldLiveIn(event, events, roots) {
    var _this$findEventById;

    if (!this.client.supportsExperimentalThreads()) {
      return {
        shouldLiveInRoom: true,
        shouldLiveInThread: false
      };
    } // A thread root is always shown in both timelines


    if (event.isThreadRoot || roots !== null && roots !== void 0 && roots.has(event.getId())) {
      return {
        shouldLiveInRoom: true,
        shouldLiveInThread: true,
        threadId: event.getId()
      };
    } // A thread relation is always only shown in a thread


    if (event.isThreadRelation) {
      return {
        shouldLiveInRoom: false,
        shouldLiveInThread: true,
        threadId: event.threadRootId
      };
    }

    const parentEventId = event.getAssociatedId();
    const parentEvent = (_this$findEventById = this.findEventById(parentEventId)) !== null && _this$findEventById !== void 0 ? _this$findEventById : events === null || events === void 0 ? void 0 : events.find(e => e.getId() === parentEventId); // Treat relations and redactions as extensions of their parents so evaluate parentEvent instead

    if (parentEvent && (event.isRelation() || event.isRedaction())) {
      return this.eventShouldLiveIn(parentEvent, events, roots);
    } // Edge case where we know the event is a relation but don't have the parentEvent


    if (roots !== null && roots !== void 0 && roots.has(event.relationEventId)) {
      return {
        shouldLiveInRoom: true,
        shouldLiveInThread: true,
        threadId: event.relationEventId
      };
    } // We've exhausted all scenarios, can safely assume that this event should live in the room timeline only


    return {
      shouldLiveInRoom: true,
      shouldLiveInThread: false
    };
  }

  findThreadForEvent(event) {
    if (!event) return null;
    const {
      threadId
    } = this.eventShouldLiveIn(event);
    return threadId ? this.getThread(threadId) : null;
  }

  async createThreadFetchRoot(threadId, events, toStartOfTimeline) {
    let thread = this.getThread(threadId);

    if (!thread) {
      const deferred = (0, utils.defer)();
      this.threadPromises.set(threadId, deferred.promise);
      let rootEvent = this.findEventById(threadId); // If the rootEvent does not exist in the local stores, then fetch it from the server.

      try {
        const eventData = await this.client.fetchRoomEvent(this.roomId, threadId);
        const mapper = this.client.getEventMapper();
        rootEvent = mapper(eventData); // will merge with existing event object if such is known
      } catch (e) {
        _logger.logger.error("Failed to fetch thread root to construct thread with", e);
      } finally {
        this.threadPromises.delete(threadId); // The root event might be not be visible to the person requesting it.
        // If it wasn't fetched successfully the thread will work in "limited" mode and won't
        // benefit from all the APIs a homeserver can provide to enhance the thread experience

        thread = this.createThread(rootEvent, events, toStartOfTimeline);

        if (thread) {
          var _rootEvent;

          (_rootEvent = rootEvent) === null || _rootEvent === void 0 ? void 0 : _rootEvent.setThread(thread);
        }

        deferred.resolve(thread);
      }
    }

    return thread;
  }

  async addThreadedEvents(events, threadId, toStartOfTimeline = false) {
    let thread = this.getThread(threadId);

    if (this.threadPromises.has(threadId)) {
      thread = await this.threadPromises.get(threadId);
    }

    events = events.filter(e => e.getId() !== threadId); // filter out any root events

    if (thread) {
      for (const event of events) {
        await thread.addEvent(event, toStartOfTimeline);
      }
    } else {
      thread = await this.createThreadFetchRoot(threadId, events, toStartOfTimeline);
    }

    if (thread) {
      this.emit(_thread.ThreadEvent.Update, thread);
    }
  }
  /**
   * Adds events to a thread's timeline. Will fire "Thread.update"
   * @experimental
   */


  async processThreadedEvents(events, toStartOfTimeline) {
    events.forEach(this.applyRedaction);
    const eventsByThread = {};

    for (const event of events) {
      const {
        threadId,
        shouldLiveInThread
      } = this.eventShouldLiveIn(event);

      if (shouldLiveInThread) {
        if (!eventsByThread[threadId]) {
          eventsByThread[threadId] = [];
        }

        eventsByThread[threadId].push(event);
      }
    }

    return Promise.all(Object.entries(eventsByThread).map(([threadId, events]) => this.addThreadedEvents(events, threadId, toStartOfTimeline)));
  }

  createThread(rootEvent, events = [], toStartOfTimeline) {
    if (rootEvent) {
      const tl = this.getTimelineForEvent(rootEvent.getId());
      const relatedEvents = tl === null || tl === void 0 ? void 0 : tl.getTimelineSet().getAllRelationsEventForEvent(rootEvent.getId());

      if (relatedEvents) {
        events = events.concat(relatedEvents);
      }
    }

    const thread = new _thread.Thread(rootEvent, {
      initialEvents: events,
      room: this,
      client: this.client
    }); // If we managed to create a thread and figure out its `id` then we can use it

    if (thread.id) {
      var _this$lastThread$root;

      this.threads.set(thread.id, thread);
      this.reEmitter.reEmit(thread, [_thread.ThreadEvent.Update, _thread.ThreadEvent.NewReply, RoomEvent.Timeline, RoomEvent.TimelineReset]);

      if (!this.lastThread || ((_this$lastThread$root = this.lastThread.rootEvent) === null || _this$lastThread$root === void 0 ? void 0 : _this$lastThread$root.localTimestamp) < (rootEvent === null || rootEvent === void 0 ? void 0 : rootEvent.localTimestamp)) {
        this.lastThread = thread;
      }

      this.emit(_thread.ThreadEvent.New, thread, toStartOfTimeline);

      if (this.threadsReady) {
        this.threadsTimelineSets.forEach(timelineSet => {
          if (thread.rootEvent) {
            if (_thread.Thread.hasServerSideSupport) {
              timelineSet.addLiveEvent(thread.rootEvent);
            } else {
              timelineSet.addEventToTimeline(thread.rootEvent, timelineSet.getLiveTimeline(), toStartOfTimeline);
            }
          }
        });
      }

      return thread;
    }
  }

  processLiveEvent(event) {
    this.applyRedaction(event); // Implement MSC3531: hiding messages.

    if (event.isVisibilityEvent()) {
      // This event changes the visibility of another event, record
      // the visibility change, inform clients if necessary.
      this.applyNewVisibilityEvent(event);
    } // If any pending visibility change is waiting for this (older) event,


    this.applyPendingVisibilityEvents(event);

    if (event.getUnsigned().transaction_id) {
      const existingEvent = this.txnToEvent[event.getUnsigned().transaction_id];

      if (existingEvent) {
        // remote echo of an event we sent earlier
        this.handleRemoteEcho(event, existingEvent);
      }
    }
  }
  /**
   * Add an event to the end of this room's live timelines. Will fire
   * "Room.timeline".
   *
   * @param {MatrixEvent} event Event to be added
   * @param {string?} duplicateStrategy 'ignore' or 'replace'
   * @param {boolean} fromCache whether the sync response came from cache
   * @fires module:client~MatrixClient#event:"Room.timeline"
   * @private
   */


  addLiveEvent(event, duplicateStrategy, fromCache = false) {
    // add to our timeline sets
    for (let i = 0; i < this.timelineSets.length; i++) {
      this.timelineSets[i].addLiveEvent(event, duplicateStrategy, fromCache);
    } // synthesize and inject implicit read receipts
    // Done after adding the event because otherwise the app would get a read receipt
    // pointing to an event that wasn't yet in the timeline
    // Don't synthesize RR for m.room.redaction as this causes the RR to go missing.


    if (event.sender && event.getType() !== _event2.EventType.RoomRedaction) {
      this.addReceipt(synthesizeReceipt(event.sender.userId, event, "m.read"), true); // Any live events from a user could be taken as implicit
      // presence information: evidence that they are currently active.
      // ...except in a world where we use 'user.currentlyActive' to reduce
      // presence spam, this isn't very useful - we'll get a transition when
      // they are no longer currently active anyway. So don't bother to
      // reset the lastActiveAgo and lastPresenceTs from the RoomState's user.
    }
  }
  /**
   * Add a pending outgoing event to this room.
   *
   * <p>The event is added to either the pendingEventList, or the live timeline,
   * depending on the setting of opts.pendingEventOrdering.
   *
   * <p>This is an internal method, intended for use by MatrixClient.
   *
   * @param {module:models/event.MatrixEvent} event The event to add.
   *
   * @param {string} txnId Transaction id for this outgoing event
   *
   * @fires module:client~MatrixClient#event:"Room.localEchoUpdated"
   *
   * @throws if the event doesn't have status SENDING, or we aren't given a
   * unique transaction id.
   */


  addPendingEvent(event, txnId) {
    if (event.status !== _eventStatus.EventStatus.SENDING && event.status !== _eventStatus.EventStatus.NOT_SENT) {
      throw new Error("addPendingEvent called on an event with status " + event.status);
    }

    if (this.txnToEvent[txnId]) {
      throw new Error("addPendingEvent called on an event with known txnId " + txnId);
    } // call setEventMetadata to set up event.sender etc
    // as event is shared over all timelineSets, we set up its metadata based
    // on the unfiltered timelineSet.


    _eventTimeline.EventTimeline.setEventMetadata(event, this.getLiveTimeline().getState(_eventTimeline.EventTimeline.FORWARDS), false);

    this.txnToEvent[txnId] = event;

    if (this.opts.pendingEventOrdering === _client.PendingEventOrdering.Detached) {
      if (this.pendingEventList.some(e => e.status === _eventStatus.EventStatus.NOT_SENT)) {
        _logger.logger.warn("Setting event as NOT_SENT due to messages in the same state");

        event.setStatus(_eventStatus.EventStatus.NOT_SENT);
      }

      this.pendingEventList.push(event);
      this.savePendingEvents();

      if (event.isRelation()) {
        // For pending events, add them to the relations collection immediately.
        // (The alternate case below already covers this as part of adding to
        // the timeline set.)
        this.aggregateNonLiveRelation(event);
      }

      if (event.isRedaction()) {
        var _this$pendingEventLis;

        const redactId = event.event.redacts;
        let redactedEvent = (_this$pendingEventLis = this.pendingEventList) === null || _this$pendingEventLis === void 0 ? void 0 : _this$pendingEventLis.find(e => e.getId() === redactId);

        if (!redactedEvent) {
          redactedEvent = this.findEventById(redactId);
        }

        if (redactedEvent) {
          redactedEvent.markLocallyRedacted(event);
          this.emit(RoomEvent.Redaction, event, this);
        }
      }
    } else {
      for (let i = 0; i < this.timelineSets.length; i++) {
        const timelineSet = this.timelineSets[i];

        if (timelineSet.getFilter()) {
          if (timelineSet.getFilter().filterRoomTimeline([event]).length) {
            timelineSet.addEventToTimeline(event, timelineSet.getLiveTimeline(), false);
          }
        } else {
          timelineSet.addEventToTimeline(event, timelineSet.getLiveTimeline(), false);
        }
      }
    }

    this.emit(RoomEvent.LocalEchoUpdated, event, this, null, null);
  }
  /**
   * Persists all pending events to local storage
   *
   * If the current room is encrypted only encrypted events will be persisted
   * all messages that are not yet encrypted will be discarded
   *
   * This is because the flow of EVENT_STATUS transition is
   * queued => sending => encrypting => sending => sent
   *
   * Steps 3 and 4 are skipped for unencrypted room.
   * It is better to discard an unencrypted message rather than persisting
   * it locally for everyone to read
   */


  savePendingEvents() {
    if (this.pendingEventList) {
      const pendingEvents = this.pendingEventList.map(event => {
        return _objectSpread(_objectSpread({}, event.event), {}, {
          txn_id: event.getTxnId()
        });
      }).filter(event => {
        // Filter out the unencrypted messages if the room is encrypted
        const isEventEncrypted = event.type === _event2.EventType.RoomMessageEncrypted;
        const isRoomEncrypted = this.client.isRoomEncrypted(this.roomId);
        return isEventEncrypted || !isRoomEncrypted;
      });
      const {
        store
      } = this.client.sessionStore;

      if (this.pendingEventList.length > 0) {
        store.setItem(pendingEventsKey(this.roomId), JSON.stringify(pendingEvents));
      } else {
        store.removeItem(pendingEventsKey(this.roomId));
      }
    }
  }
  /**
   * Used to aggregate the local echo for a relation, and also
   * for re-applying a relation after it's redaction has been cancelled,
   * as the local echo for the redaction of the relation would have
   * un-aggregated the relation. Note that this is different from regular messages,
   * which are just kept detached for their local echo.
   *
   * Also note that live events are aggregated in the live EventTimelineSet.
   * @param {module:models/event.MatrixEvent} event the relation event that needs to be aggregated.
   */


  aggregateNonLiveRelation(event) {
    const {
      shouldLiveInRoom,
      threadId
    } = this.eventShouldLiveIn(event);
    const thread = this.getThread(threadId);
    thread === null || thread === void 0 ? void 0 : thread.timelineSet.aggregateRelations(event);

    if (shouldLiveInRoom) {
      // TODO: We should consider whether this means it would be a better
      // design to lift the relations handling up to the room instead.
      for (let i = 0; i < this.timelineSets.length; i++) {
        const timelineSet = this.timelineSets[i];

        if (timelineSet.getFilter()) {
          if (timelineSet.getFilter().filterRoomTimeline([event]).length) {
            timelineSet.aggregateRelations(event);
          }
        } else {
          timelineSet.aggregateRelations(event);
        }
      }
    }
  }

  getEventForTxnId(txnId) {
    return this.txnToEvent[txnId];
  }
  /**
   * Deal with the echo of a message we sent.
   *
   * <p>We move the event to the live timeline if it isn't there already, and
   * update it.
   *
   * @param {module:models/event.MatrixEvent} remoteEvent   The event received from
   *    /sync
   * @param {module:models/event.MatrixEvent} localEvent    The local echo, which
   *    should be either in the pendingEventList or the timeline.
   *
   * @fires module:client~MatrixClient#event:"Room.localEchoUpdated"
   * @private
   */


  handleRemoteEcho(remoteEvent, localEvent) {
    const oldEventId = localEvent.getId();
    const newEventId = remoteEvent.getId();
    const oldStatus = localEvent.status;

    _logger.logger.debug(`Got remote echo for event ${oldEventId} -> ${newEventId} old status ${oldStatus}`); // no longer pending


    delete this.txnToEvent[remoteEvent.getUnsigned().transaction_id]; // if it's in the pending list, remove it

    if (this.pendingEventList) {
      this.removePendingEvent(oldEventId);
    } // replace the event source (this will preserve the plaintext payload if
    // any, which is good, because we don't want to try decoding it again).


    localEvent.handleRemoteEcho(remoteEvent.event);
    const {
      shouldLiveInRoom,
      threadId
    } = this.eventShouldLiveIn(remoteEvent);
    const thread = this.getThread(threadId);
    thread === null || thread === void 0 ? void 0 : thread.timelineSet.handleRemoteEcho(localEvent, oldEventId, newEventId);

    if (shouldLiveInRoom) {
      for (let i = 0; i < this.timelineSets.length; i++) {
        const timelineSet = this.timelineSets[i]; // if it's already in the timeline, update the timeline map. If it's not, add it.

        timelineSet.handleRemoteEcho(localEvent, oldEventId, newEventId);
      }
    }

    this.emit(RoomEvent.LocalEchoUpdated, localEvent, this, oldEventId, oldStatus);
  }
  /**
   * Update the status / event id on a pending event, to reflect its transmission
   * progress.
   *
   * <p>This is an internal method.
   *
   * @param {MatrixEvent} event      local echo event
   * @param {EventStatus} newStatus  status to assign
   * @param {string} newEventId      new event id to assign. Ignored unless
   *    newStatus == EventStatus.SENT.
   * @fires module:client~MatrixClient#event:"Room.localEchoUpdated"
   */


  updatePendingEvent(event, newStatus, newEventId) {
    _logger.logger.log(`setting pendingEvent status to ${newStatus} in ${event.getRoomId()} ` + `event ID ${event.getId()} -> ${newEventId}`); // if the message was sent, we expect an event id


    if (newStatus == _eventStatus.EventStatus.SENT && !newEventId) {
      throw new Error("updatePendingEvent called with status=SENT, " + "but no new event id");
    } // SENT races against /sync, so we have to special-case it.


    if (newStatus == _eventStatus.EventStatus.SENT) {
      const timeline = this.getTimelineForEvent(newEventId);

      if (timeline) {
        // we've already received the event via the event stream.
        // nothing more to do here.
        return;
      }
    }

    const oldStatus = event.status;
    const oldEventId = event.getId();

    if (!oldStatus) {
      throw new Error("updatePendingEventStatus called on an event which is " + "not a local echo.");
    }

    const allowed = ALLOWED_TRANSITIONS[oldStatus];

    if (!allowed || allowed.indexOf(newStatus) < 0) {
      throw new Error("Invalid EventStatus transition " + oldStatus + "->" + newStatus);
    }

    event.setStatus(newStatus);

    if (newStatus == _eventStatus.EventStatus.SENT) {
      // update the event id
      event.replaceLocalEventId(newEventId);
      const {
        shouldLiveInRoom,
        threadId
      } = this.eventShouldLiveIn(event);
      const thread = this.getThread(threadId);
      thread === null || thread === void 0 ? void 0 : thread.timelineSet.replaceEventId(oldEventId, newEventId);

      if (shouldLiveInRoom) {
        // if the event was already in the timeline (which will be the case if
        // opts.pendingEventOrdering==chronological), we need to update the
        // timeline map.
        for (let i = 0; i < this.timelineSets.length; i++) {
          this.timelineSets[i].replaceEventId(oldEventId, newEventId);
        }
      }
    } else if (newStatus == _eventStatus.EventStatus.CANCELLED) {
      // remove it from the pending event list, or the timeline.
      if (this.pendingEventList) {
        const removedEvent = this.getPendingEvent(oldEventId);
        this.removePendingEvent(oldEventId);

        if (removedEvent.isRedaction()) {
          this.revertRedactionLocalEcho(removedEvent);
        }
      }

      this.removeEvent(oldEventId);
    }

    this.savePendingEvents();
    this.emit(RoomEvent.LocalEchoUpdated, event, this, oldEventId, oldStatus);
  }

  revertRedactionLocalEcho(redactionEvent) {
    const redactId = redactionEvent.event.redacts;

    if (!redactId) {
      return;
    }

    const redactedEvent = this.getUnfilteredTimelineSet().findEventById(redactId);

    if (redactedEvent) {
      redactedEvent.unmarkLocallyRedacted(); // re-render after undoing redaction

      this.emit(RoomEvent.RedactionCancelled, redactionEvent, this); // reapply relation now redaction failed

      if (redactedEvent.isRelation()) {
        this.aggregateNonLiveRelation(redactedEvent);
      }
    }
  }
  /**
   * Add some events to this room. This can include state events, message
   * events and typing notifications. These events are treated as "live" so
   * they will go to the end of the timeline.
   *
   * @param {MatrixEvent[]} events A list of events to add.
   *
   * @param {string} duplicateStrategy Optional. Applies to events in the
   * timeline only. If this is 'replace' then if a duplicate is encountered, the
   * event passed to this function will replace the existing event in the
   * timeline. If this is not specified, or is 'ignore', then the event passed to
   * this function will be ignored entirely, preserving the existing event in the
   * timeline. Events are identical based on their event ID <b>only</b>.
   *
   * @param {boolean} fromCache whether the sync response came from cache
   * @throws If <code>duplicateStrategy</code> is not falsey, 'replace' or 'ignore'.
   */


  addLiveEvents(events, duplicateStrategy, fromCache = false) {
    if (duplicateStrategy && ["replace", "ignore"].indexOf(duplicateStrategy) === -1) {
      throw new Error("duplicateStrategy MUST be either 'replace' or 'ignore'");
    } // sanity check that the live timeline is still live


    for (let i = 0; i < this.timelineSets.length; i++) {
      const liveTimeline = this.timelineSets[i].getLiveTimeline();

      if (liveTimeline.getPaginationToken(_eventTimeline.EventTimeline.FORWARDS)) {
        throw new Error("live timeline " + i + " is no longer live - it has a pagination token " + "(" + liveTimeline.getPaginationToken(_eventTimeline.EventTimeline.FORWARDS) + ")");
      }

      if (liveTimeline.getNeighbouringTimeline(_eventTimeline.EventTimeline.FORWARDS)) {
        throw new Error(`live timeline ${i} is no longer live - it has a neighbouring timeline`);
      }
    }

    const threadRoots = this.findThreadRoots(events);
    const threadInfos = events.map(e => this.eventShouldLiveIn(e, events, threadRoots));
    const eventsByThread = {};

    for (let i = 0; i < events.length; i++) {
      // TODO: We should have a filter to say "only add state event types X Y Z to the timeline".
      this.processLiveEvent(events[i]);
      const {
        shouldLiveInRoom,
        shouldLiveInThread,
        threadId
      } = threadInfos[i];

      if (shouldLiveInThread) {
        if (!eventsByThread[threadId]) {
          eventsByThread[threadId] = [];
        }

        eventsByThread[threadId].push(events[i]);
      }

      if (shouldLiveInRoom) {
        this.addLiveEvent(events[i], duplicateStrategy, fromCache);
      }
    }

    Object.entries(eventsByThread).forEach(([threadId, threadEvents]) => {
      this.addThreadedEvents(threadEvents, threadId, false);
    });
  }

  partitionThreadedEvents(events) {
    // Indices to the events array, for readability
    const ROOM = 0;
    const THREAD = 1;

    if (this.client.supportsExperimentalThreads()) {
      const threadRoots = this.findThreadRoots(events);
      return events.reduce((memo, event) => {
        const {
          shouldLiveInRoom,
          shouldLiveInThread,
          threadId
        } = this.eventShouldLiveIn(event, events, threadRoots);

        if (shouldLiveInRoom) {
          memo[ROOM].push(event);
        }

        if (shouldLiveInThread) {
          event.setThreadId(threadId);
          memo[THREAD].push(event);
        }

        return memo;
      }, [[], []]);
    } else {
      // When `experimentalThreadSupport` is disabled treat all events as timelineEvents
      return [events, []];
    }
  }
  /**
   * Given some events, find the IDs of all the thread roots that are referred to by them.
   */


  findThreadRoots(events) {
    const threadRoots = new Set();

    for (const event of events) {
      if (event.isThreadRelation) {
        threadRoots.add(event.relationEventId);
      }
    }

    return threadRoots;
  }
  /**
   * Adds/handles ephemeral events such as typing notifications and read receipts.
   * @param {MatrixEvent[]} events A list of events to process
   */


  addEphemeralEvents(events) {
    for (const event of events) {
      if (event.getType() === 'm.typing') {
        this.currentState.setTypingEvent(event);
      } else if (event.getType() === 'm.receipt') {
        this.addReceipt(event);
      } // else ignore - life is too short for us to care about these events

    }
  }
  /**
   * Removes events from this room.
   * @param {String[]} eventIds A list of eventIds to remove.
   */


  removeEvents(eventIds) {
    for (let i = 0; i < eventIds.length; ++i) {
      this.removeEvent(eventIds[i]);
    }
  }
  /**
   * Removes a single event from this room.
   *
   * @param {String} eventId  The id of the event to remove
   *
   * @return {boolean} true if the event was removed from any of the room's timeline sets
   */


  removeEvent(eventId) {
    let removedAny = false;

    for (let i = 0; i < this.timelineSets.length; i++) {
      const removed = this.timelineSets[i].removeEvent(eventId);

      if (removed) {
        if (removed.isRedaction()) {
          this.revertRedactionLocalEcho(removed);
        }

        removedAny = true;
      }
    }

    return removedAny;
  }
  /**
   * Recalculate various aspects of the room, including the room name and
   * room summary. Call this any time the room's current state is modified.
   * May fire "Room.name" if the room name is updated.
   * @fires module:client~MatrixClient#event:"Room.name"
   */


  recalculate() {
    // set fake stripped state events if this is an invite room so logic remains
    // consistent elsewhere.
    const membershipEvent = this.currentState.getStateEvents(_event2.EventType.RoomMember, this.myUserId);

    if (membershipEvent) {
      const membership = membershipEvent.getContent().membership;
      this.updateMyMembership(membership);

      if (membership === "invite") {
        const strippedStateEvents = membershipEvent.getUnsigned().invite_room_state || [];
        strippedStateEvents.forEach(strippedEvent => {
          const existingEvent = this.currentState.getStateEvents(strippedEvent.type, strippedEvent.state_key);

          if (!existingEvent) {
            // set the fake stripped event instead
            this.currentState.setStateEvents([new _event.MatrixEvent({
              type: strippedEvent.type,
              state_key: strippedEvent.state_key,
              content: strippedEvent.content,
              event_id: "$fake" + Date.now(),
              room_id: this.roomId,
              user_id: this.myUserId // technically a lie

            })]);
          }
        });
      }
    }

    const oldName = this.name;
    this.name = this.calculateRoomName(this.myUserId);
    this.normalizedName = (0, utils.normalize)(this.name);
    this.summary = new _roomSummary.RoomSummary(this.roomId, {
      title: this.name
    });

    if (oldName !== this.name) {
      this.emit(RoomEvent.Name, this);
    }
  }
  /**
   * Get a list of user IDs who have <b>read up to</b> the given event.
   * @param {MatrixEvent} event the event to get read receipts for.
   * @return {String[]} A list of user IDs.
   */


  getUsersReadUpTo(event) {
    return this.getReceiptsForEvent(event).filter(function (receipt) {
      return receipt.type === "m.read";
    }).map(function (receipt) {
      return receipt.userId;
    });
  }

  getReadReceiptForUserId(userId, ignoreSynthesized = false) {
    var _this$receipts$mRead, _this$receipts$mRead2;

    const [realReceipt, syntheticReceipt] = (_this$receipts$mRead = (_this$receipts$mRead2 = this.receipts["m.read"]) === null || _this$receipts$mRead2 === void 0 ? void 0 : _this$receipts$mRead2[userId]) !== null && _this$receipts$mRead !== void 0 ? _this$receipts$mRead : [];

    if (ignoreSynthesized) {
      return realReceipt;
    }

    return syntheticReceipt !== null && syntheticReceipt !== void 0 ? syntheticReceipt : realReceipt;
  }
  /**
   * Get the ID of the event that a given user has read up to, or null if we
   * have received no read receipts from them.
   * @param {String} userId The user ID to get read receipt event ID for
   * @param {Boolean} ignoreSynthesized If true, return only receipts that have been
   *                                    sent by the server, not implicit ones generated
   *                                    by the JS SDK.
   * @return {String} ID of the latest event that the given user has read, or null.
   */


  getEventReadUpTo(userId, ignoreSynthesized = false) {
    var _readReceipt$eventId;

    const readReceipt = this.getReadReceiptForUserId(userId, ignoreSynthesized);
    return (_readReceipt$eventId = readReceipt === null || readReceipt === void 0 ? void 0 : readReceipt.eventId) !== null && _readReceipt$eventId !== void 0 ? _readReceipt$eventId : null;
  }
  /**
   * Determines if the given user has read a particular event ID with the known
   * history of the room. This is not a definitive check as it relies only on
   * what is available to the room at the time of execution.
   * @param {String} userId The user ID to check the read state of.
   * @param {String} eventId The event ID to check if the user read.
   * @returns {Boolean} True if the user has read the event, false otherwise.
   */


  hasUserReadEvent(userId, eventId) {
    const readUpToId = this.getEventReadUpTo(userId, false);
    if (readUpToId === eventId) return true;

    if (this.timeline.length && this.timeline[this.timeline.length - 1].getSender() && this.timeline[this.timeline.length - 1].getSender() === userId) {
      // It doesn't matter where the event is in the timeline, the user has read
      // it because they've sent the latest event.
      return true;
    }

    for (let i = this.timeline.length - 1; i >= 0; --i) {
      const ev = this.timeline[i]; // If we encounter the target event first, the user hasn't read it
      // however if we encounter the readUpToId first then the user has read
      // it. These rules apply because we're iterating bottom-up.

      if (ev.getId() === eventId) return false;
      if (ev.getId() === readUpToId) return true;
    } // We don't know if the user has read it, so assume not.


    return false;
  }
  /**
   * Get a list of receipts for the given event.
   * @param {MatrixEvent} event the event to get receipts for
   * @return {Object[]} A list of receipts with a userId, type and data keys or
   * an empty list.
   */


  getReceiptsForEvent(event) {
    return this.receiptCacheByEventId[event.getId()] || [];
  }
  /**
   * Add a receipt event to the room.
   * @param {MatrixEvent} event The m.receipt event.
   * @param {Boolean} synthetic True if this event is implicit.
   */


  addReceipt(event, synthetic = false) {
    this.addReceiptsToStructure(event, synthetic); // send events after we've regenerated the structure & cache, otherwise things that
    // listened for the event would read stale data.

    this.emit(RoomEvent.Receipt, event, this);
  }
  /**
   * Add a receipt event to the room.
   * @param {MatrixEvent} event The m.receipt event.
   * @param {Boolean} synthetic True if this event is implicit.
   */


  addReceiptsToStructure(event, synthetic) {
    const content = event.getContent();
    Object.keys(content).forEach(eventId => {
      Object.keys(content[eventId]).forEach(receiptType => {
        Object.keys(content[eventId][receiptType]).forEach(userId => {
          var _pair$ReceiptPairSynt2, _pair$ReceiptPairSynt3;

          const receipt = content[eventId][receiptType][userId];

          if (!this.receipts[receiptType]) {
            this.receipts[receiptType] = {};
          }

          if (!this.receipts[receiptType][userId]) {
            this.receipts[receiptType][userId] = [null, null];
          }

          const pair = this.receipts[receiptType][userId];
          let existingReceipt = pair[ReceiptPairRealIndex];

          if (synthetic) {
            var _pair$ReceiptPairSynt;

            existingReceipt = (_pair$ReceiptPairSynt = pair[ReceiptPairSyntheticIndex]) !== null && _pair$ReceiptPairSynt !== void 0 ? _pair$ReceiptPairSynt : pair[ReceiptPairRealIndex];
          }

          if (existingReceipt) {
            // we only want to add this receipt if we think it is later than the one we already have.
            // This is managed server-side, but because we synthesize RRs locally we have to do it here too.
            const ordering = this.getUnfilteredTimelineSet().compareEventOrdering(existingReceipt.eventId, eventId);

            if (ordering !== null && ordering >= 0) {
              return;
            }
          }

          const wrappedReceipt = {
            eventId,
            data: receipt
          };
          const realReceipt = synthetic ? pair[ReceiptPairRealIndex] : wrappedReceipt;
          const syntheticReceipt = synthetic ? wrappedReceipt : pair[ReceiptPairSyntheticIndex];
          let ordering = null;

          if (realReceipt && syntheticReceipt) {
            ordering = this.getUnfilteredTimelineSet().compareEventOrdering(realReceipt.eventId, syntheticReceipt.eventId);
          }

          const preferSynthetic = ordering === null || ordering < 0; // we don't bother caching just real receipts by event ID as there's nothing that would read it.
          // Take the current cached receipt before we overwrite the pair elements.

          const cachedReceipt = (_pair$ReceiptPairSynt2 = pair[ReceiptPairSyntheticIndex]) !== null && _pair$ReceiptPairSynt2 !== void 0 ? _pair$ReceiptPairSynt2 : pair[ReceiptPairRealIndex];

          if (synthetic && preferSynthetic) {
            pair[ReceiptPairSyntheticIndex] = wrappedReceipt;
          } else if (!synthetic) {
            pair[ReceiptPairRealIndex] = wrappedReceipt;

            if (!preferSynthetic) {
              pair[ReceiptPairSyntheticIndex] = null;
            }
          }

          const newCachedReceipt = (_pair$ReceiptPairSynt3 = pair[ReceiptPairSyntheticIndex]) !== null && _pair$ReceiptPairSynt3 !== void 0 ? _pair$ReceiptPairSynt3 : pair[ReceiptPairRealIndex];
          if (cachedReceipt === newCachedReceipt) return; // clean up any previous cache entry

          if (cachedReceipt && this.receiptCacheByEventId[cachedReceipt.eventId]) {
            const previousEventId = cachedReceipt.eventId; // Remove the receipt we're about to clobber out of existence from the cache

            this.receiptCacheByEventId[previousEventId] = this.receiptCacheByEventId[previousEventId].filter(r => {
              return r.type !== receiptType || r.userId !== userId;
            });

            if (this.receiptCacheByEventId[previousEventId].length < 1) {
              delete this.receiptCacheByEventId[previousEventId]; // clean up the cache keys
            }
          } // cache the new one


          if (!this.receiptCacheByEventId[eventId]) {
            this.receiptCacheByEventId[eventId] = [];
          }

          this.receiptCacheByEventId[eventId].push({
            userId: userId,
            type: receiptType,
            data: receipt
          });
        });
      });
    });
  }
  /**
   * Add a temporary local-echo receipt to the room to reflect in the
   * client the fact that we've sent one.
   * @param {string} userId The user ID if the receipt sender
   * @param {MatrixEvent} e The event that is to be acknowledged
   * @param {string} receiptType The type of receipt
   */


  addLocalEchoReceipt(userId, e, receiptType) {
    this.addReceipt(synthesizeReceipt(userId, e, receiptType), true);
  }
  /**
   * Update the room-tag event for the room.  The previous one is overwritten.
   * @param {MatrixEvent} event the m.tag event
   */


  addTags(event) {
    // event content looks like:
    // content: {
    //    tags: {
    //       $tagName: { $metadata: $value },
    //       $tagName: { $metadata: $value },
    //    }
    // }
    // XXX: do we need to deep copy here?
    this.tags = event.getContent().tags || {}; // XXX: we could do a deep-comparison to see if the tags have really
    // changed - but do we want to bother?

    this.emit(RoomEvent.Tags, event, this);
  }
  /**
   * Update the account_data events for this room, overwriting events of the same type.
   * @param {Array<MatrixEvent>} events an array of account_data events to add
   */


  addAccountData(events) {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      if (event.getType() === "m.tag") {
        this.addTags(event);
      }

      const lastEvent = this.accountData[event.getType()];
      this.accountData[event.getType()] = event;
      this.emit(RoomEvent.AccountData, event, this, lastEvent);
    }
  }
  /**
   * Access account_data event of given event type for this room
   * @param {string} type the type of account_data event to be accessed
   * @return {?MatrixEvent} the account_data event in question
   */


  getAccountData(type) {
    return this.accountData[type];
  }
  /**
   * Returns whether the syncing user has permission to send a message in the room
   * @return {boolean} true if the user should be permitted to send
   *                   message events into the room.
   */


  maySendMessage() {
    return this.getMyMembership() === 'join' && (this.client.isRoomEncrypted(this.roomId) ? this.currentState.maySendEvent(_event2.EventType.RoomMessageEncrypted, this.myUserId) : this.currentState.maySendEvent(_event2.EventType.RoomMessage, this.myUserId));
  }
  /**
   * Returns whether the given user has permissions to issue an invite for this room.
   * @param {string} userId the ID of the Matrix user to check permissions for
   * @returns {boolean} true if the user should be permitted to issue invites for this room.
   */


  canInvite(userId) {
    let canInvite = this.getMyMembership() === "join";
    const powerLevelsEvent = this.currentState.getStateEvents(_event2.EventType.RoomPowerLevels, "");
    const powerLevels = powerLevelsEvent && powerLevelsEvent.getContent();
    const me = this.getMember(userId);

    if (powerLevels && me && powerLevels.invite > me.powerLevel) {
      canInvite = false;
    }

    return canInvite;
  }
  /**
   * Returns the join rule based on the m.room.join_rule state event, defaulting to `invite`.
   * @returns {string} the join_rule applied to this room
   */


  getJoinRule() {
    return this.currentState.getJoinRule();
  }
  /**
   * Returns the history visibility based on the m.room.history_visibility state event, defaulting to `shared`.
   * @returns {HistoryVisibility} the history_visibility applied to this room
   */


  getHistoryVisibility() {
    return this.currentState.getHistoryVisibility();
  }
  /**
   * Returns the history visibility based on the m.room.history_visibility state event, defaulting to `shared`.
   * @returns {HistoryVisibility} the history_visibility applied to this room
   */


  getGuestAccess() {
    return this.currentState.getGuestAccess();
  }
  /**
   * Returns the type of the room from the `m.room.create` event content or undefined if none is set
   * @returns {?string} the type of the room.
   */


  getType() {
    const createEvent = this.currentState.getStateEvents(_event2.EventType.RoomCreate, "");

    if (!createEvent) {
      if (!this.getTypeWarning) {
        _logger.logger.warn("[getType] Room " + this.roomId + " does not have an m.room.create event");

        this.getTypeWarning = true;
      }

      return undefined;
    }

    return createEvent.getContent()[_event2.RoomCreateTypeField];
  }
  /**
   * Returns whether the room is a space-room as defined by MSC1772.
   * @returns {boolean} true if the room's type is RoomType.Space
   */


  isSpaceRoom() {
    return this.getType() === _event2.RoomType.Space;
  }
  /**
   * Returns whether the room is a call-room as defined by MSC3417.
   * @returns {boolean} true if the room's type is RoomType.UnstableCall
   */


  isCallRoom() {
    return this.getType() === _event2.RoomType.UnstableCall;
  }
  /**
   * Returns whether the room is a video room.
   * @returns {boolean} true if the room's type is RoomType.ElementVideo
   */


  isElementVideoRoom() {
    return this.getType() === _event2.RoomType.ElementVideo;
  }
  /**
   * This is an internal method. Calculates the name of the room from the current
   * room state.
   * @param {string} userId The client's user ID. Used to filter room members
   * correctly.
   * @param {boolean} ignoreRoomNameEvent Return the implicit room name that we'd see if there
   * was no m.room.name event.
   * @return {string} The calculated room name.
   */


  calculateRoomName(userId, ignoreRoomNameEvent = false) {
    if (!ignoreRoomNameEvent) {
      // check for an alias, if any. for now, assume first alias is the
      // official one.
      const mRoomName = this.currentState.getStateEvents(_event2.EventType.RoomName, "");

      if (mRoomName && mRoomName.getContent() && mRoomName.getContent().name) {
        return mRoomName.getContent().name;
      }
    }

    const alias = this.getCanonicalAlias();

    if (alias) {
      return alias;
    }

    const joinedMemberCount = this.currentState.getJoinedMemberCount();
    const invitedMemberCount = this.currentState.getInvitedMemberCount(); // -1 because these numbers include the syncing user

    let inviteJoinCount = joinedMemberCount + invitedMemberCount - 1; // get service members (e.g. helper bots) for exclusion

    let excludedUserIds = [];
    const mFunctionalMembers = this.currentState.getStateEvents(_event2.UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name, "");

    if (Array.isArray(mFunctionalMembers === null || mFunctionalMembers === void 0 ? void 0 : mFunctionalMembers.getContent().service_members)) {
      excludedUserIds = mFunctionalMembers.getContent().service_members;
    } // get members that are NOT ourselves and are actually in the room.


    let otherNames = null;

    if (this.summaryHeroes) {
      // if we have a summary, the member state events
      // should be in the room state
      otherNames = [];
      this.summaryHeroes.forEach(userId => {
        // filter service members
        if (excludedUserIds.includes(userId)) {
          inviteJoinCount--;
          return;
        }

        const member = this.getMember(userId);
        otherNames.push(member ? member.name : userId);
      });
    } else {
      let otherMembers = this.currentState.getMembers().filter(m => {
        return m.userId !== userId && (m.membership === "invite" || m.membership === "join");
      });
      otherMembers = otherMembers.filter(({
        userId
      }) => {
        // filter service members
        if (excludedUserIds.includes(userId)) {
          inviteJoinCount--;
          return false;
        }

        return true;
      }); // make sure members have stable order

      otherMembers.sort((a, b) => a.userId.localeCompare(b.userId)); // only 5 first members, immitate summaryHeroes

      otherMembers = otherMembers.slice(0, 5);
      otherNames = otherMembers.map(m => m.name);
    }

    if (inviteJoinCount) {
      return memberNamesToRoomName(otherNames, inviteJoinCount);
    }

    const myMembership = this.getMyMembership(); // if I have created a room and invited people through
    // 3rd party invites

    if (myMembership == 'join') {
      const thirdPartyInvites = this.currentState.getStateEvents(_event2.EventType.RoomThirdPartyInvite);

      if (thirdPartyInvites && thirdPartyInvites.length) {
        const thirdPartyNames = thirdPartyInvites.map(i => {
          return i.getContent().display_name;
        });
        return `Inviting ${memberNamesToRoomName(thirdPartyNames)}`;
      }
    } // let's try to figure out who was here before


    let leftNames = otherNames; // if we didn't have heroes, try finding them in the room state

    if (!leftNames.length) {
      leftNames = this.currentState.getMembers().filter(m => {
        return m.userId !== userId && m.membership !== "invite" && m.membership !== "join";
      }).map(m => m.name);
    }

    if (leftNames.length) {
      return `Empty room (was ${memberNamesToRoomName(leftNames)})`;
    } else {
      return "Empty room";
    }
  }
  /**
   * When we receive a new visibility change event:
   *
   * - store this visibility change alongside the timeline, in case we
   *   later need to apply it to an event that we haven't received yet;
   * - if we have already received the event whose visibility has changed,
   *   patch it to reflect the visibility change and inform listeners.
   */


  applyNewVisibilityEvent(event) {
    const visibilityChange = event.asVisibilityChange();

    if (!visibilityChange) {
      // The event is ill-formed.
      return;
    } // Ignore visibility change events that are not emitted by moderators.


    const userId = event.getSender();

    if (!userId) {
      return;
    }

    const isPowerSufficient = _event2.EVENT_VISIBILITY_CHANGE_TYPE.name && this.currentState.maySendStateEvent(_event2.EVENT_VISIBILITY_CHANGE_TYPE.name, userId) || _event2.EVENT_VISIBILITY_CHANGE_TYPE.altName && this.currentState.maySendStateEvent(_event2.EVENT_VISIBILITY_CHANGE_TYPE.altName, userId);

    if (!isPowerSufficient) {
      // Powerlevel is insufficient.
      return;
    } // Record this change in visibility.
    // If the event is not in our timeline and we only receive it later,
    // we may need to apply the visibility change at a later date.


    const visibilityEventsOnOriginalEvent = this.visibilityEvents.get(visibilityChange.eventId);

    if (visibilityEventsOnOriginalEvent) {
      // It would be tempting to simply erase the latest visibility change
      // but we need to record all of the changes in case the latest change
      // is ever redacted.
      //
      // In practice, linear scans through `visibilityEvents` should be fast.
      // However, to protect against a potential DoS attack, we limit the
      // number of iterations in this loop.
      let index = visibilityEventsOnOriginalEvent.length - 1;
      const min = Math.max(0, visibilityEventsOnOriginalEvent.length - MAX_NUMBER_OF_VISIBILITY_EVENTS_TO_SCAN_THROUGH);

      for (; index >= min; --index) {
        const target = visibilityEventsOnOriginalEvent[index];

        if (target.getTs() < event.getTs()) {
          break;
        }
      }

      if (index === -1) {
        visibilityEventsOnOriginalEvent.unshift(event);
      } else {
        visibilityEventsOnOriginalEvent.splice(index + 1, 0, event);
      }
    } else {
      this.visibilityEvents.set(visibilityChange.eventId, [event]);
    } // Finally, let's check if the event is already in our timeline.
    // If so, we need to patch it and inform listeners.


    const originalEvent = this.findEventById(visibilityChange.eventId);

    if (!originalEvent) {
      return;
    }

    originalEvent.applyVisibilityEvent(visibilityChange);
  }

  redactVisibilityChangeEvent(event) {
    // Sanity checks.
    if (!event.isVisibilityEvent) {
      throw new Error("expected a visibility change event");
    }

    const relation = event.getRelation();
    const originalEventId = relation.event_id;
    const visibilityEventsOnOriginalEvent = this.visibilityEvents.get(originalEventId);

    if (!visibilityEventsOnOriginalEvent) {
      // No visibility changes on the original event.
      // In particular, this change event was not recorded,
      // most likely because it was ill-formed.
      return;
    }

    const index = visibilityEventsOnOriginalEvent.findIndex(change => change.getId() === event.getId());

    if (index === -1) {
      // This change event was not recorded, most likely because
      // it was ill-formed.
      return;
    } // Remove visibility change.


    visibilityEventsOnOriginalEvent.splice(index, 1); // If we removed the latest visibility change event, propagate changes.

    if (index === visibilityEventsOnOriginalEvent.length) {
      const originalEvent = this.findEventById(originalEventId);

      if (!originalEvent) {
        return;
      }

      if (index === 0) {
        // We have just removed the only visibility change event.
        this.visibilityEvents.delete(originalEventId);
        originalEvent.applyVisibilityEvent();
      } else {
        const newEvent = visibilityEventsOnOriginalEvent[visibilityEventsOnOriginalEvent.length - 1];
        const newVisibility = newEvent.asVisibilityChange();

        if (!newVisibility) {
          // Event is ill-formed.
          // This breaks our invariant.
          throw new Error("at this stage, visibility changes should be well-formed");
        }

        originalEvent.applyVisibilityEvent(newVisibility);
      }
    }
  }
  /**
   * When we receive an event whose visibility has been altered by
   * a (more recent) visibility change event, patch the event in
   * place so that clients now not to display it.
   *
   * @param event Any matrix event. If this event has at least one a
   * pending visibility change event, apply the latest visibility
   * change event.
   */


  applyPendingVisibilityEvents(event) {
    const visibilityEvents = this.visibilityEvents.get(event.getId());

    if (!visibilityEvents || visibilityEvents.length == 0) {
      // No pending visibility change in store.
      return;
    }

    const visibilityEvent = visibilityEvents[visibilityEvents.length - 1];
    const visibilityChange = visibilityEvent.asVisibilityChange();

    if (!visibilityChange) {
      return;
    }

    if (visibilityChange.visible) {// Events are visible by default, no need to apply a visibility change.
      // Note that we need to keep the visibility changes in `visibilityEvents`,
      // in case we later fetch an older visibility change event that is superseded
      // by `visibilityChange`.
    }

    if (visibilityEvent.getTs() < event.getTs()) {
      // Something is wrong, the visibility change cannot happen before the
      // event. Presumably an ill-formed event.
      return;
    }

    event.applyVisibilityEvent(visibilityChange);
  }

}
/**
 * @param {string} roomId ID of the current room
 * @returns {string} Storage key to retrieve pending events
 */


exports.Room = Room;

function pendingEventsKey(roomId) {
  return `mx_pending_events_${roomId}`;
} // a map from current event status to a list of allowed next statuses


const ALLOWED_TRANSITIONS = {
  [_eventStatus.EventStatus.ENCRYPTING]: [_eventStatus.EventStatus.SENDING, _eventStatus.EventStatus.NOT_SENT, _eventStatus.EventStatus.CANCELLED],
  [_eventStatus.EventStatus.SENDING]: [_eventStatus.EventStatus.ENCRYPTING, _eventStatus.EventStatus.QUEUED, _eventStatus.EventStatus.NOT_SENT, _eventStatus.EventStatus.SENT],
  [_eventStatus.EventStatus.QUEUED]: [_eventStatus.EventStatus.SENDING, _eventStatus.EventStatus.CANCELLED],
  [_eventStatus.EventStatus.SENT]: [],
  [_eventStatus.EventStatus.NOT_SENT]: [_eventStatus.EventStatus.SENDING, _eventStatus.EventStatus.QUEUED, _eventStatus.EventStatus.CANCELLED],
  [_eventStatus.EventStatus.CANCELLED]: []
}; // TODO i18n

function memberNamesToRoomName(names, count = names.length + 1) {
  const countWithoutMe = count - 1;

  if (!names.length) {
    return "Empty room";
  } else if (names.length === 1 && countWithoutMe <= 1) {
    return names[0];
  } else if (names.length === 2 && countWithoutMe <= 2) {
    return `${names[0]} and ${names[1]}`;
  } else {
    const plural = countWithoutMe > 1;

    if (plural) {
      return `${names[0]} and ${countWithoutMe} others`;
    } else {
      return `${names[0]} and 1 other`;
    }
  }
}
/**
 * Fires when an event we had previously received is redacted.
 *
 * (Note this is *not* fired when the redaction happens before we receive the
 * event).
 *
 * @event module:client~MatrixClient#"Room.redaction"
 * @param {MatrixEvent} event The matrix redaction event
 * @param {Room} room The room containing the redacted event
 */

/**
 * Fires when an event that was previously redacted isn't anymore.
 * This happens when the redaction couldn't be sent and
 * was subsequently cancelled by the user. Redactions have a local echo
 * which is undone in this scenario.
 *
 * @event module:client~MatrixClient#"Room.redactionCancelled"
 * @param {MatrixEvent} event The matrix redaction event that was cancelled.
 * @param {Room} room The room containing the unredacted event
 */

/**
 * Fires whenever the name of a room is updated.
 * @event module:client~MatrixClient#"Room.name"
 * @param {Room} room The room whose Room.name was updated.
 * @example
 * matrixClient.on("Room.name", function(room){
 *   var newName = room.name;
 * });
 */

/**
 * Fires whenever a receipt is received for a room
 * @event module:client~MatrixClient#"Room.receipt"
 * @param {event} event The receipt event
 * @param {Room} room The room whose receipts was updated.
 * @example
 * matrixClient.on("Room.receipt", function(event, room){
 *   var receiptContent = event.getContent();
 * });
 */

/**
 * Fires whenever a room's tags are updated.
 * @event module:client~MatrixClient#"Room.tags"
 * @param {event} event The tags event
 * @param {Room} room The room whose Room.tags was updated.
 * @example
 * matrixClient.on("Room.tags", function(event, room){
 *   var newTags = event.getContent().tags;
 *   if (newTags["favourite"]) showStar(room);
 * });
 */

/**
 * Fires whenever a room's account_data is updated.
 * @event module:client~MatrixClient#"Room.accountData"
 * @param {event} event The account_data event
 * @param {Room} room The room whose account_data was updated.
 * @param {MatrixEvent} prevEvent The event being replaced by
 * the new account data, if known.
 * @example
 * matrixClient.on("Room.accountData", function(event, room, oldEvent){
 *   if (event.getType() === "m.room.colorscheme") {
 *       applyColorScheme(event.getContents());
 *   }
 * });
 */

/**
 * Fires when the status of a transmitted event is updated.
 *
 * <p>When an event is first transmitted, a temporary copy of the event is
 * inserted into the timeline, with a temporary event id, and a status of
 * 'SENDING'.
 *
 * <p>Once the echo comes back from the server, the content of the event
 * (MatrixEvent.event) is replaced by the complete event from the homeserver,
 * thus updating its event id, as well as server-generated fields such as the
 * timestamp. Its status is set to null.
 *
 * <p>Once the /send request completes, if the remote echo has not already
 * arrived, the event is updated with a new event id and the status is set to
 * 'SENT'. The server-generated fields are of course not updated yet.
 *
 * <p>If the /send fails, In this case, the event's status is set to
 * 'NOT_SENT'. If it is later resent, the process starts again, setting the
 * status to 'SENDING'. Alternatively, the message may be cancelled, which
 * removes the event from the room, and sets the status to 'CANCELLED'.
 *
 * <p>This event is raised to reflect each of the transitions above.
 *
 * @event module:client~MatrixClient#"Room.localEchoUpdated"
 *
 * @param {MatrixEvent} event The matrix event which has been updated
 *
 * @param {Room} room The room containing the redacted event
 *
 * @param {string} oldEventId The previous event id (the temporary event id,
 *    except when updating a successfully-sent event when its echo arrives)
 *
 * @param {EventStatus} oldStatus The previous event status.
 */

/**
 * Fires when the logged in user's membership in the room is updated.
 *
 * @event module:models/room~Room#"Room.myMembership"
 * @param {Room} room The room in which the membership has been updated
 * @param {string} membership The new membership value
 * @param {string} prevMembership The previous membership value
 */