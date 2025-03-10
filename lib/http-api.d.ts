/// <reference types="node" />
import type { IncomingHttpHeaders, IncomingMessage } from "http";
import type { Request as _Request, CoreOptions } from "request";
import { IUploadOpts } from "./@types/requests";
import { IAbortablePromise, IUsageLimit } from "./@types/partials";
import { Callback } from "./client";
import { TypedEventEmitter } from "./models/typed-event-emitter";
/**
 * A constant representing the URI path for release 0 of the Client-Server HTTP API.
 */
export declare const PREFIX_R0 = "/_matrix/client/r0";
/**
 * A constant representing the URI path for release v1 of the Client-Server HTTP API.
 */
export declare const PREFIX_V1 = "/_matrix/client/v1";
/**
 * A constant representing the URI path for as-yet unspecified Client-Server HTTP APIs.
 */
export declare const PREFIX_UNSTABLE = "/_matrix/client/unstable";
/**
 * URI path for v1 of the the identity API
 * @deprecated Use v2.
 */
export declare const PREFIX_IDENTITY_V1 = "/_matrix/identity/api/v1";
/**
 * URI path for the v2 identity API
 */
export declare const PREFIX_IDENTITY_V2 = "/_matrix/identity/v2";
/**
 * URI path for the media repo API
 */
export declare const PREFIX_MEDIA_R0 = "/_matrix/media/r0";
declare type RequestProps = "method" | "withCredentials" | "json" | "headers" | "qs" | "body" | "qsStringifyOptions" | "useQuerystring" | "timeout";
export interface IHttpOpts {
    baseUrl: string;
    idBaseUrl?: string;
    prefix: string;
    onlyData: boolean;
    accessToken?: string;
    extraParams?: Record<string, string>;
    localTimeoutMs?: number;
    useAuthorizationHeader?: boolean;
    request(opts: Pick<CoreOptions, RequestProps> & {
        uri: string;
        method: Method;
        _matrix_opts: IHttpOpts;
    }, callback: RequestCallback): IRequest;
}
interface IRequest extends _Request {
    onprogress?(e: unknown): void;
}
interface IRequestOpts<T> {
    prefix?: string;
    localTimeoutMs?: number;
    headers?: Record<string, string>;
    json?: boolean;
    qsStringifyOptions?: CoreOptions["qsStringifyOptions"];
    bodyParser?(body: string): T;
    inhibitLogoutEmit?: boolean;
}
export interface IUpload {
    loaded: number;
    total: number;
    promise: IAbortablePromise<unknown>;
}
interface IContentUri {
    base: string;
    path: string;
    params: {
        access_token: string;
    };
}
declare type ResponseType<T, O extends IRequestOpts<T> | void = void> = O extends {
    bodyParser: (body: string) => T;
} ? T : O extends {
    json: false;
} ? string : T;
interface IUploadResponse {
    content_uri: string;
}
export declare type UploadContentResponseType<O extends IUploadOpts> = O extends undefined ? string : O extends {
    rawResponse: true;
} ? string : O extends {
    onlyContentUri: true;
} ? string : O extends {
    rawResponse: false;
} ? IUploadResponse : O extends {
    onlyContentUri: false;
} ? IUploadResponse : string;
export declare enum Method {
    Get = "GET",
    Put = "PUT",
    Post = "POST",
    Delete = "DELETE"
}
export declare type FileType = Document | XMLHttpRequestBodyInit;
export declare enum HttpApiEvent {
    SessionLoggedOut = "Session.logged_out",
    NoConsent = "no_consent"
}
export declare type HttpApiEventHandlerMap = {
    [HttpApiEvent.SessionLoggedOut]: (err: MatrixError) => void;
    [HttpApiEvent.NoConsent]: (message: string, consentUri: string) => void;
};
/**
 * Construct a MatrixHttpApi.
 * @constructor
 * @param {EventEmitter} eventEmitter The event emitter to use for emitting events
 * @param {Object} opts The options to use for this HTTP API.
 * @param {string} opts.baseUrl Required. The base client-server URL e.g.
 * 'http://localhost:8008'.
 * @param {Function} opts.request Required. The function to call for HTTP
 * requests. This function must look like function(opts, callback){ ... }.
 * @param {string} opts.prefix Required. The matrix client prefix to use, e.g.
 * '/_matrix/client/r0'. See PREFIX_R0 and PREFIX_UNSTABLE for constants.
 *
 * @param {boolean} opts.onlyData True to return only the 'data' component of the
 * response (e.g. the parsed HTTP body). If false, requests will return an
 * object with the properties <tt>code</tt>, <tt>headers</tt> and <tt>data</tt>.
 *
 * @param {string=} opts.accessToken The access_token to send with requests. Can be
 * null to not send an access token.
 * @param {Object=} opts.extraParams Optional. Extra query parameters to send on
 * requests.
 * @param {Number=} opts.localTimeoutMs The default maximum amount of time to wait
 * before timing out the request. If not specified, there is no timeout.
 * @param {boolean} [opts.useAuthorizationHeader = false] Set to true to use
 * Authorization header instead of query param to send the access token to the server.
 */
export declare class MatrixHttpApi {
    private eventEmitter;
    readonly opts: IHttpOpts;
    private uploads;
    constructor(eventEmitter: TypedEventEmitter<HttpApiEvent, HttpApiEventHandlerMap>, opts: IHttpOpts);
    /**
     * Sets the base URL for the identity server
     * @param {string} url The new base url
     */
    setIdBaseUrl(url: string): void;
    /**
     * Get the content repository url with query parameters.
     * @return {Object} An object with a 'base', 'path' and 'params' for base URL,
     *          path and query parameters respectively.
     */
    getContentUri(): IContentUri;
    /**
     * Upload content to the homeserver
     *
     * @param {object} file The object to upload. On a browser, something that
     *   can be sent to XMLHttpRequest.send (typically a File).  Under node.js,
     *   a Buffer, String or ReadStream.
     *
     * @param {object} opts  options object
     *
     * @param {string=} opts.name   Name to give the file on the server. Defaults
     *   to <tt>file.name</tt>.
     *
     * @param {boolean=} opts.includeFilename if false will not send the filename,
     *   e.g for encrypted file uploads where filename leaks are undesirable.
     *   Defaults to true.
     *
     * @param {string=} opts.type   Content-type for the upload. Defaults to
     *   <tt>file.type</tt>, or <tt>applicaton/octet-stream</tt>.
     *
     * @param {boolean=} opts.rawResponse Return the raw body, rather than
     *   parsing the JSON. Defaults to false (except on node.js, where it
     *   defaults to true for backwards compatibility).
     *
     * @param {boolean=} opts.onlyContentUri Just return the content URI,
     *   rather than the whole body. Defaults to false (except on browsers,
     *   where it defaults to true for backwards compatibility). Ignored if
     *   opts.rawResponse is true.
     *
     * @param {Function=} opts.callback Deprecated. Optional. The callback to
     *    invoke on success/failure. See the promise return values for more
     *    information.
     *
     * @param {Function=} opts.progressHandler Optional. Called when a chunk of
     *    data has been uploaded, with an object containing the fields `loaded`
     *    (number of bytes transferred) and `total` (total size, if known).
     *
     * @return {Promise} Resolves to response object, as
     *    determined by this.opts.onlyData, opts.rawResponse, and
     *    opts.onlyContentUri.  Rejects with an error (usually a MatrixError).
     */
    uploadContent<O extends IUploadOpts>(file: FileType, opts?: O): IAbortablePromise<UploadContentResponseType<O>>;
    cancelUpload(promise: IAbortablePromise<unknown>): boolean;
    getCurrentUploads(): IUpload[];
    idServerRequest<T>(callback: Callback<T>, method: Method, path: string, params: Record<string, string | string[]>, prefix: string, accessToken: string): Promise<T>;
    /**
     * Perform an authorised request to the homeserver.
     * @param {Function} callback Optional. The callback to invoke on
     * success/failure. See the promise return values for more information.
     * @param {string} method The HTTP method e.g. "GET".
     * @param {string} path The HTTP path <b>after</b> the supplied prefix e.g.
     * "/createRoom".
     *
     * @param {Object=} queryParams A dict of query params (these will NOT be
     * urlencoded). If unspecified, there will be no query params.
     *
     * @param {Object} [data] The HTTP JSON body.
     *
     * @param {Object|Number=} opts additional options. If a number is specified,
     * this is treated as `opts.localTimeoutMs`.
     *
     * @param {Number=} opts.localTimeoutMs The maximum amount of time to wait before
     * timing out the request. If not specified, there is no timeout.
     *
     * @param {string=} opts.prefix The full prefix to use e.g.
     * "/_matrix/client/v2_alpha". If not specified, uses this.opts.prefix.
     *
     * @param {Object=} opts.headers map of additional request headers
     *
     * @return {Promise} Resolves to <code>{data: {Object},
     * headers: {Object}, code: {Number}}</code>.
     * If <code>onlyData</code> is set, this will resolve to the <code>data</code>
     * object only.
     * @return {module:http-api.MatrixError} Rejects with an error if a problem
     * occurred. This includes network problems and Matrix-specific error JSON.
     */
    authedRequest<T, O extends IRequestOpts<T> = IRequestOpts<T>>(callback: Callback<T>, method: Method, path: string, queryParams?: Record<string, string | string[]>, data?: CoreOptions["body"], opts?: O | number): IAbortablePromise<ResponseType<T, O>>;
    /**
     * Perform a request to the homeserver without any credentials.
     * @param {Function} callback Optional. The callback to invoke on
     * success/failure. See the promise return values for more information.
     * @param {string} method The HTTP method e.g. "GET".
     * @param {string} path The HTTP path <b>after</b> the supplied prefix e.g.
     * "/createRoom".
     *
     * @param {Object=} queryParams A dict of query params (these will NOT be
     * urlencoded). If unspecified, there will be no query params.
     *
     * @param {Object} [data] The HTTP JSON body.
     *
     * @param {Object=} opts additional options
     *
     * @param {Number=} opts.localTimeoutMs The maximum amount of time to wait before
     * timing out the request. If not specified, there is no timeout.
     *
     * @param {string=} opts.prefix The full prefix to use e.g.
     * "/_matrix/client/v2_alpha". If not specified, uses this.opts.prefix.
     *
     * @param {Object=} opts.headers map of additional request headers
     *
     * @return {Promise} Resolves to <code>{data: {Object},
     * headers: {Object}, code: {Number}}</code>.
     * If <code>onlyData</code> is set, this will resolve to the <code>data</code>
     * object only.
     * @return {module:http-api.MatrixError} Rejects with an error if a problem
     * occurred. This includes network problems and Matrix-specific error JSON.
     */
    request<T, O extends IRequestOpts<T> = IRequestOpts<T>>(callback: Callback<T>, method: Method, path: string, queryParams?: CoreOptions["qs"], data?: CoreOptions["body"], opts?: O): IAbortablePromise<ResponseType<T, O>>;
    /**
     * Perform a request to an arbitrary URL.
     * @param {Function} callback Optional. The callback to invoke on
     * success/failure. See the promise return values for more information.
     * @param {string} method The HTTP method e.g. "GET".
     * @param {string} uri The HTTP URI
     *
     * @param {Object=} queryParams A dict of query params (these will NOT be
     * urlencoded). If unspecified, there will be no query params.
     *
     * @param {Object} [data] The HTTP JSON body.
     *
     * @param {Object=} opts additional options
     *
     * @param {Number=} opts.localTimeoutMs The maximum amount of time to wait before
     * timing out the request. If not specified, there is no timeout.
     *
     * @param {string=} opts.prefix The full prefix to use e.g.
     * "/_matrix/client/v2_alpha". If not specified, uses this.opts.prefix.
     *
     * @param {Object=} opts.headers map of additional request headers
     *
     * @return {Promise} Resolves to <code>{data: {Object},
     * headers: {Object}, code: {Number}}</code>.
     * If <code>onlyData</code> is set, this will resolve to the <code>data</code>
     * object only.
     * @return {module:http-api.MatrixError} Rejects with an error if a problem
     * occurred. This includes network problems and Matrix-specific error JSON.
     */
    requestOtherUrl<T, O extends IRequestOpts<T> = IRequestOpts<T>>(callback: Callback<T>, method: Method, uri: string, queryParams?: CoreOptions["qs"], data?: CoreOptions["body"], opts?: O | number): IAbortablePromise<ResponseType<T, O>>;
    /**
     * Form and return a homeserver request URL based on the given path
     * params and prefix.
     * @param {string} path The HTTP path <b>after</b> the supplied prefix e.g.
     * "/createRoom".
     * @param {Object} queryParams A dict of query params (these will NOT be
     * urlencoded).
     * @param {string} prefix The full prefix to use e.g.
     * "/_matrix/client/v2_alpha".
     * @return {string} URL
     */
    getUrl(path: string, queryParams: CoreOptions["qs"], prefix: string): string;
    /**
     * @private
     *
     * @param {function} callback
     * @param {string} method
     * @param {string} uri
     * @param {object} queryParams
     * @param {object|string} data
     * @param {object=} opts
     *
     * @param {boolean} [opts.json =true] Json-encode data before sending, and
     *   decode response on receipt. (We will still json-decode error
     *   responses, even if this is false.)
     *
     * @param {object=} opts.headers  extra request headers
     *
     * @param {number=} opts.localTimeoutMs client-side timeout for the
     *    request. Default timeout if falsy.
     *
     * @param {function=} opts.bodyParser function to parse the body of the
     *    response before passing it to the promise and callback.
     *
     * @return {Promise} a promise which resolves to either the
     * response object (if this.opts.onlyData is truthy), or the parsed
     * body. Rejects
     *
     * Generic T is the callback/promise resolve type
     * Generic O should be inferred
     */
    private doRequest;
}
declare type RequestCallback = (err?: Error, response?: XMLHttpRequest | IncomingMessage, body?: string) => void;
export interface IResponse<T> {
    code: number;
    data: T;
    headers?: IncomingHttpHeaders;
}
interface IErrorJson extends Partial<IUsageLimit> {
    [key: string]: any;
    errcode?: string;
    error?: string;
}
/**
 * Construct a Matrix error. This is a JavaScript Error with additional
 * information specific to the standard Matrix error response.
 * @constructor
 * @param {Object} errorJson The Matrix error JSON returned from the homeserver.
 * @prop {string} errcode The Matrix 'errcode' value, e.g. "M_FORBIDDEN".
 * @prop {string} name Same as MatrixError.errcode but with a default unknown string.
 * @prop {string} message The Matrix 'error' value, e.g. "Missing token."
 * @prop {Object} data The raw Matrix error JSON used to construct this object.
 * @prop {integer} httpStatus The numeric HTTP status code given
 */
export declare class MatrixError extends Error {
    readonly errcode: string;
    readonly data: IErrorJson;
    httpStatus?: number;
    constructor(errorJson?: IErrorJson);
}
/**
 * Construct a ConnectionError. This is a JavaScript Error indicating
 * that a request failed because of some error with the connection, either
 * CORS was not correctly configured on the server, the server didn't response,
 * the request timed out, or the internet connection on the client side went down.
 * @constructor
 */
export declare class ConnectionError extends Error {
    constructor(message: string, cause?: Error);
    get name(): string;
}
export declare class AbortError extends Error {
    constructor();
    get name(): string;
}
/**
 * Retries a network operation run in a callback.
 * @param  {number}   maxAttempts maximum attempts to try
 * @param  {Function} callback    callback that returns a promise of the network operation. If rejected with ConnectionError, it will be retried by calling the callback again.
 * @return {any} the result of the network operation
 * @throws {ConnectionError} If after maxAttempts the callback still throws ConnectionError
 */
export declare function retryNetworkOperation<T>(maxAttempts: number, callback: () => T): Promise<T>;
export {};
//# sourceMappingURL=http-api.d.ts.map