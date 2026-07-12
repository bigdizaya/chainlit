import asyncio
import json
from typing import Any, Dict, Literal, Optional, Tuple, TypedDict, Union
from urllib.parse import unquote

from starlette.requests import cookie_parser
from typing_extensions import NotRequired, TypeAlias

from chainlit.auth import (
    get_current_user,
    get_token_from_cookies,
    require_login,
)
from chainlit.chat_context import chat_context
from chainlit.config import ChainlitConfig, config
from chainlit.context import init_ws_context
from chainlit.data import get_data_layer
from chainlit.logger import logger
from chainlit.message import ErrorMessage, Message
from chainlit.server import sio
from chainlit.session import ClientType, WebsocketSession
from chainlit.types import (
    InputAudioChunk,
    InputAudioChunkPayload,
    MessagePayload,
)
from chainlit.user import PersistedUser, User
from chainlit.user_session import user_sessions

WSGIEnvironment: TypeAlias = dict[str, Any]


class WebSocketSessionAuth(TypedDict):
    sessionId: str
    userEnv: str | None
    clientType: ClientType
    chatProfile: str | None
    threadId: str | None
    freshChat: NotRequired[str | bool | None]


def restore_existing_session(sid, session_id, emit_fn, emit_call_fn, environ):
    """Restore a session from the sessionId provided by the client."""
    if session := WebsocketSession.get_by_id(session_id):
        session.restore(new_socket_id=sid)
        session.emit = emit_fn
        session.emit_call = emit_call_fn
        session.environ = environ
        return True
    return False


async def persist_user_session(thread_id: str, metadata: Dict):
    if data_layer := get_data_layer():
        await data_layer.update_thread(thread_id=thread_id, metadata=metadata)


def is_fresh_chat_request(auth: WebSocketSessionAuth) -> bool:
    # `freshChat` is a one-shot hint. Once a thread id exists, reconnecting
    # must resume that thread instead of deleting the session and starting over.
    if auth.get("threadId"):
        return False

    value = auth.get("freshChat")
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).lower() in {"1", "true", "yes"}


async def resume_thread(session: WebsocketSession):
    data_layer = get_data_layer()
    if not data_layer or not session.user or not session.thread_id_to_resume:
        return
    thread = await data_layer.get_thread(thread_id=session.thread_id_to_resume)
    if not thread:
        return

    author = thread.get("userIdentifier")
    user_is_author = author == session.user.identifier

    if user_is_author:
        metadata = thread.get("metadata") or {}
        if isinstance(metadata, str):
            metadata = json.loads(metadata)
        user_sessions[session.id] = metadata.copy()
        if chat_profile := metadata.get("chat_profile"):
            session.chat_profile = chat_profile
        if chat_settings := metadata.get("chat_settings"):
            session.chat_settings = chat_settings

        return thread


def load_user_env(user_env):
    if user_env:
        user_env_dict = json.loads(user_env)
    # Check user env
    if config.project.user_env:
        if not user_env_dict:
            raise ConnectionRefusedError("Missing user environment variables")
        # Check if requested user environment variables are provided
        for key in config.project.user_env:
            if key not in user_env_dict:
                raise ConnectionRefusedError(
                    "Missing user environment variable: " + key
                )
    return user_env_dict


def _get_token_from_cookie(environ: WSGIEnvironment) -> Optional[str]:
    if cookie_header := environ.get("HTTP_COOKIE", None):
        cookies = cookie_parser(cookie_header)
        return get_token_from_cookies(cookies)

    return None


def _get_token(environ: WSGIEnvironment) -> Optional[str]:
    """Take WSGI environ, return access token."""
    return _get_token_from_cookie(environ)


async def _authenticate_connection(
    environ: WSGIEnvironment,
) -> Union[Tuple[Union[User, PersistedUser], str], Tuple[None, None]]:
    if token := _get_token(environ):
        user = await get_current_user(token=token)
        if user:
            return user, token

    return None, None


@sio.on("connect")  # pyright: ignore [reportOptionalCall]
async def connect(sid: str, environ: WSGIEnvironment, auth: WebSocketSessionAuth):
    user: User | PersistedUser | None = None
    token: str | None = None
    thread_id = auth.get("threadId", None)
    fresh_chat = is_fresh_chat_request(auth)

    if require_login():
        try:
            user, token = await _authenticate_connection(environ)
        except Exception as e:
            logger.exception("Exception authenticating connection: %s", e)

        if not user:
            logger.error("Authentication failed in websocket connect.")
            raise ConnectionRefusedError("authentication failed")

        if thread_id:
            if data_layer := get_data_layer():
                thread = await data_layer.get_thread(thread_id)
                if thread and not (thread["userIdentifier"] == user.identifier):
                    logger.error("Authorization for the thread failed.")
                    raise ConnectionRefusedError("authorization failed")

    # Session scoped function to emit to the client
    def emit_fn(event, data):
        return sio.emit(event, data, to=sid)

    # Session scoped function to emit to the client and wait for a response
    def emit_call_fn(event: Literal["ask", "call_fn"], data, timeout):
        return sio.call(event, data, timeout=timeout, to=sid)

    session_id = auth["sessionId"]
    if fresh_chat:
        if existing_session := WebsocketSession.get_by_id(session_id):
            await existing_session.delete()
    elif restore_existing_session(sid, session_id, emit_fn, emit_call_fn, environ):
        return True

    user_env_string = auth.get("userEnv", None)
    user_env = load_user_env(user_env_string)

    client_type = auth["clientType"]
    url_encoded_chat_profile = auth.get("chatProfile", None)
    chat_profile = (
        unquote(url_encoded_chat_profile) if url_encoded_chat_profile else None
    )

    WebsocketSession(
        id=session_id,
        socket_id=sid,
        emit=emit_fn,
        emit_call=emit_call_fn,
        client_type=client_type,
        user_env=user_env,
        user=user,
        token=token,
        chat_profile=chat_profile,
        thread_id=thread_id,
        environ=environ,
    )

    return True


@sio.on("connection_successful")  # pyright: ignore [reportOptionalCall]
async def connection_successful(sid):
    context = init_ws_context(sid)

    await context.emitter.task_end()
    await context.emitter.clear("clear_ask")
    await context.emitter.clear("clear_call_fn")

    if context.session.restored and not context.session.has_first_interaction:
        if config.code.on_chat_start:
            task = asyncio.create_task(config.code.on_chat_start())
            context.session.current_task = task
        return

    if context.session.thread_id_to_resume and config.code.on_chat_resume:
        thread = await resume_thread(context.session)
        if thread:
            context.session.has_first_interaction = True
            await context.emitter.emit(
                "first_interaction",
                {"interaction": "resume", "thread_id": thread.get("id")},
            )
            await config.code.on_chat_resume(thread)

            for step in thread.get("steps", []):
                if "message" in step["type"]:
                    chat_context.add(Message.from_dict(step))

            await context.emitter.resume_thread(thread)
            return
        else:
            await context.emitter.send_resume_thread_error("Thread not found.")

    if config.code.on_chat_start:
        task = asyncio.create_task(config.code.on_chat_start())
        context.session.current_task = task


@sio.on("clear_session")  # pyright: ignore [reportOptionalCall]
async def clean_session(sid):
    session = WebsocketSession.get(sid)
    if session:
        session.to_clear = True


@sio.on("disconnect")  # pyright: ignore [reportOptionalCall]
async def disconnect(sid):
    session = WebsocketSession.get(sid)

    if not session:
        return

    context = init_ws_context(session)
    await _cancel_active_audio(session, context, reason="disconnect")

    if config.code.on_chat_end:
        await config.code.on_chat_end()

    if session.thread_id and session.has_first_interaction:
        await persist_user_session(session.thread_id, session.to_persistable())

    async def clear(_sid):
        if session := WebsocketSession.get(_sid):
            # Clean up the user session
            if session.id in user_sessions:
                user_sessions.pop(session.id)
            # Clean up the session
            await session.delete()

    if session.to_clear:
        await clear(sid)
    else:

        async def clear_on_timeout(_sid):
            await asyncio.sleep(config.project.session_timeout)
            await clear(_sid)

        asyncio.ensure_future(clear_on_timeout(sid))


@sio.on("stop")  # pyright: ignore [reportOptionalCall]
async def stop(sid):
    if session := WebsocketSession.get(sid):
        context = init_ws_context(session)
        await Message(content="Task manually stopped.").send()

        if session.current_task:
            session.current_task.cancel()

        await _cancel_active_audio(session, context, reason="task_stopped")

        if config.code.on_stop:
            await config.code.on_stop()


async def process_message(session: WebsocketSession, payload: MessagePayload):
    """Process a message from the user."""
    try:
        context = init_ws_context(session)
        await context.emitter.task_start()
        message = await context.emitter.process_message(payload)

        if config.code.on_message:
            await asyncio.sleep(0.001)
            await config.code.on_message(message)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.exception(e)
        await ErrorMessage(
            author="Error", content=str(e) or e.__class__.__name__
        ).send()
    finally:
        await context.emitter.task_end()


def _get_audio_chunk_tasks(session: WebsocketSession) -> set[asyncio.Task]:
    tasks = getattr(session, "audio_chunk_tasks", None)
    if tasks is None:
        tasks = set()
        session.audio_chunk_tasks = tasks
    return tasks


def _get_audio_chunk_lock(session: WebsocketSession) -> asyncio.Lock:
    lock = getattr(session, "audio_chunk_lock", None)
    if lock is None:
        lock = asyncio.Lock()
        session.audio_chunk_lock = lock
    return lock


async def _run_audio_chunk_handler(
    session: WebsocketSession, payload: InputAudioChunkPayload
):
    config: ChainlitConfig = session.get_config()
    async with _get_audio_chunk_lock(session):
        await config.code.on_audio_chunk(InputAudioChunk(**payload))


def _track_audio_chunk_task(session: WebsocketSession, task: asyncio.Task) -> None:
    tasks = _get_audio_chunk_tasks(session)
    tasks.add(task)

    def cleanup(completed: asyncio.Task):
        tasks.discard(completed)
        if completed.cancelled():
            return

        try:
            completed.result()
        except Exception as exc:
            logger.error(
                "Audio chunk handler failed",
                exc_info=(type(exc), exc, exc.__traceback__),
            )

    task.add_done_callback(cleanup)


async def _drain_audio_chunk_tasks(session: WebsocketSession) -> None:
    tasks = _get_audio_chunk_tasks(session)
    pending = [task for task in tuple(tasks) if not task.done()]
    if not pending:
        return

    await asyncio.gather(*pending, return_exceptions=True)


async def _cancel_audio_chunk_tasks(session: WebsocketSession) -> None:
    tasks = _get_audio_chunk_tasks(session)
    pending = [task for task in tuple(tasks) if not task.done()]
    if not pending:
        tasks.clear()
        return

    for task in pending:
        task.cancel()

    await asyncio.gather(*pending, return_exceptions=True)
    tasks.clear()


def _audio_recording_id(payload: Optional[dict]) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    value = payload.get("recordingId")
    return value if isinstance(value, str) and value else None


def _matches_active_audio(
    session: WebsocketSession, recording_id: Optional[str]
) -> bool:
    if not getattr(session, "audio_active", False):
        return False
    active_id = getattr(session, "active_audio_recording_id", None)
    # Legacy clients did not send ids. Keep them working while new clients get
    # strict stale-event protection.
    return recording_id is None or active_id is None or recording_id == active_id


async def _cancel_active_audio(
    session: WebsocketSession,
    context,
    *,
    recording_id: Optional[str] = None,
    reason: str = "cancelled",
    emit_connection: bool = True,
) -> bool:
    if not _matches_active_audio(session, recording_id):
        return False

    active_id = getattr(session, "active_audio_recording_id", None)
    session.audio_attempt_version = getattr(session, "audio_attempt_version", 0) + 1
    session.audio_active = False
    await _cancel_audio_chunk_tasks(session)

    session_config: ChainlitConfig = session.get_config()
    if session_config.code.on_audio_cancel:
        try:
            await session_config.code.on_audio_cancel()
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Audio cancel handler failed (%s)", reason)

    if (
        not getattr(session, "audio_active", False)
        and getattr(session, "active_audio_recording_id", None) == active_id
    ):
        session.active_audio_recording_id = None
        if emit_connection:
            await context.emitter.update_audio_connection("off", active_id)
    return True


@sio.on("edit_message")  # pyright: ignore [reportOptionalCall]
async def edit_message(sid, payload: MessagePayload):
    """Handle a message sent by the User."""
    session = WebsocketSession.require(sid)
    context = init_ws_context(session)

    messages = chat_context.get()

    orig_message = None

    for message in messages:
        if orig_message:
            await message.remove()

        if message.id == payload["message"]["id"]:
            message.content = payload["message"]["output"]
            await message.update()
            orig_message = message

    await context.emitter.task_start()

    if config.code.on_message:
        try:
            await config.code.on_message(orig_message)
        except asyncio.CancelledError:
            pass
        finally:
            await context.emitter.task_end()


@sio.on("message_favorite")  # pyright: ignore [reportOptionalCall]
async def message_favorite(sid, payload: MessagePayload):
    """Handle a message favorite toggle."""
    session = WebsocketSession.require(sid)
    context = init_ws_context(session)
    data_layer = get_data_layer()

    if not config.features.favorites or not session.user:
        return

    payload_message = payload["message"]
    payload_metadata = payload_message.get("metadata") or {}
    favorite = bool(payload_metadata.get("favorite", False))

    step_dict = None

    if favorite:
        for message in chat_context.get():
            if message.id == payload_message["id"]:
                message.metadata = message.metadata or {}
                message.metadata["favorite"] = favorite
                step_dict = message.to_dict()
                break
    elif data_layer:
        favorites = await data_layer.get_favorite_steps(session.user.id)
        for fav in favorites:
            if fav["id"] == payload_message["id"]:
                step_dict = fav
                break

    if step_dict is None:
        logger.error("Could not find step to update favorite status.")
        return

    created_at = step_dict.get("createdAt")
    if created_at and not created_at.endswith("Z"):
        step_dict["createdAt"] = f"{created_at}Z"

    if data_layer:
        step_dict = await data_layer.set_step_favorite(step_dict, favorite)

    await context.emitter.update_step(step_dict)
    await fetch_favorites(sid)


@sio.on("fetch_favorites")  # pyright: ignore [reportOptionalCall]
async def fetch_favorites(sid):
    session = WebsocketSession.require(sid)
    context = init_ws_context(session)
    if session.user and config.features.favorites:
        if data_layer := get_data_layer():
            favorites = await data_layer.get_favorite_steps(session.user.id)
            await context.emitter.set_favorites(favorites)


@sio.on("client_message")  # pyright: ignore [reportOptionalCall]
async def message(sid, payload: MessagePayload):
    """Handle a message sent by the User."""
    session = WebsocketSession.require(sid)

    task = asyncio.create_task(process_message(session, payload))
    session.current_task = task


@sio.on("window_message")  # pyright: ignore [reportOptionalCall]
async def window_message(sid, data):
    """Handle a message send by the host window."""
    session = WebsocketSession.require(sid)
    init_ws_context(session)

    if config.code.on_window_message:
        try:
            await config.code.on_window_message(data)
        except asyncio.CancelledError:
            pass


@sio.on("audio_start")  # pyright: ignore [reportOptionalCall]
async def audio_start(sid, payload=None):
    """Handle audio init."""
    session = WebsocketSession.require(sid)

    context = init_ws_context(session)
    config: ChainlitConfig = session.get_config()  # type: ignore

    if config.features.audio and config.features.audio.enabled:
        recording_id = _audio_recording_id(payload)
        if getattr(session, "audio_active", False):
            await _cancel_active_audio(
                session,
                context,
                recording_id=getattr(session, "active_audio_recording_id", None),
                reason="superseded",
            )
        else:
            await _drain_audio_chunk_tasks(session)
        _get_audio_chunk_tasks(session).clear()
        session.audio_attempt_version = getattr(session, "audio_attempt_version", 0) + 1
        attempt_version = session.audio_attempt_version
        session.audio_active = True
        session.active_audio_recording_id = recording_id
        try:
            connected = bool(await config.code.on_audio_start())
        except asyncio.CancelledError:
            connected = False
        except Exception:
            logger.exception("Audio start handler failed")
            connected = False

        is_current_attempt = (
            getattr(session, "audio_attempt_version", 0) == attempt_version
            and getattr(session, "audio_active", False)
            and getattr(session, "active_audio_recording_id", None) == recording_id
        )
        if not is_current_attempt:
            return

        connection_state = "on" if connected else "off"
        if not connected:
            session.audio_active = False
            session.active_audio_recording_id = None
        await context.emitter.update_audio_connection(connection_state, recording_id)
        if not connected:
            await context.emitter.send_toast(
                "Recording did not start. Please wait a moment and try again.",
                "warning",
            )


@sio.on("audio_chunk")
async def audio_chunk(sid, payload: InputAudioChunkPayload):
    """Handle an audio chunk sent by the user."""
    session = WebsocketSession.require(sid)

    init_ws_context(session)

    config: ChainlitConfig = session.get_config()
    recording_id = _audio_recording_id(payload)

    if (
        _matches_active_audio(session, recording_id)
        and config.features.audio
        and config.features.audio.enabled
        and config.code.on_audio_chunk
    ):
        task = asyncio.create_task(_run_audio_chunk_handler(session, payload))
        _track_audio_chunk_task(session, task)


@sio.on("audio_end")
async def audio_end(sid, payload=None):
    """Handle the end of the audio stream."""
    session = WebsocketSession.require(sid)
    context = init_ws_context(session)
    task_started = False
    recording_id = _audio_recording_id(payload)

    if not _matches_active_audio(session, recording_id):
        return

    active_id = getattr(session, "active_audio_recording_id", None)
    session.audio_active = False

    try:
        config: ChainlitConfig = session.get_config()  # type: ignore
        audio_result = None

        if config.features.audio and config.features.audio.enabled:
            await _drain_audio_chunk_tasks(session)
            audio_result = await config.code.on_audio_end()

        if audio_result is False:
            return

        await context.emitter.task_start()
        task_started = True

        if audio_result is not False and not session.has_first_interaction:
            session.has_first_interaction = True
            asyncio.create_task(context.emitter.init_thread("audio"))

    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.exception(e)
        await ErrorMessage(
            author="Error", content=str(e) or e.__class__.__name__
        ).send()
    finally:
        if task_started:
            await context.emitter.task_end()
        if (
            not getattr(session, "audio_active", False)
            and getattr(session, "active_audio_recording_id", None) == active_id
        ):
            session.active_audio_recording_id = None
            await context.emitter.update_audio_connection("off", active_id)


@sio.on("audio_cancel")
async def audio_cancel(sid, payload=None):
    """Abandon an audio attempt without invoking transcription."""
    session = WebsocketSession.require(sid)
    context = init_ws_context(session)
    await _cancel_active_audio(
        session,
        context,
        recording_id=_audio_recording_id(payload),
        reason=(payload or {}).get("reason", "cancelled")
        if isinstance(payload, dict)
        else "cancelled",
    )


@sio.on("chat_settings_change")
async def change_settings(sid, settings: Dict[str, Any]):
    """Handle change settings submit from the UI."""
    context = init_ws_context(sid)

    for key, value in settings.items():
        context.session.chat_settings[key] = value

    if config.code.on_settings_update:
        await config.code.on_settings_update(settings)


@sio.on("chat_settings_edit")
async def edit_settings(sid, settings: Dict[str, Any]):
    """Handle change settings edit from the UI (on the fly)."""
    init_ws_context(sid)

    if config.code.on_settings_edit:
        await config.code.on_settings_edit(settings)
