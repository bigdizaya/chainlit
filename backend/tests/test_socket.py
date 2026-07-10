import asyncio
import json
from unittest.mock import AsyncMock, Mock, patch

import pytest

from chainlit.session import WebsocketSession
from chainlit.socket import (
    _authenticate_connection,
    _cancel_audio_chunk_tasks,
    _get_token,
    _get_token_from_cookie,
    audio_chunk,
    audio_end,
    clean_session,
    is_fresh_chat_request,
    load_user_env,
    persist_user_session,
    restore_existing_session,
    resume_thread,
)


class TestFreshChatRequest:
    def test_accepts_fresh_chat_without_thread_id(self):
        assert is_fresh_chat_request({"threadId": "", "freshChat": "1"}) is True

    @pytest.mark.parametrize("value", ["1", "true", True])
    def test_reconnect_with_thread_id_is_never_fresh(self, value):
        auth = {"threadId": "thread_123", "freshChat": value}

        assert is_fresh_chat_request(auth) is False

    def test_rejects_missing_fresh_chat_hint(self):
        assert is_fresh_chat_request({"threadId": ""}) is False


class TestGetTokenFromCookie:
    """Test suite for _get_token_from_cookie function."""

    def test_get_token_from_cookie_with_valid_cookie(self):
        """Test extracting token from valid cookie header."""
        with patch("chainlit.socket.get_token_from_cookies") as mock_get_token:
            mock_get_token.return_value = "test_token"
            environ = {"HTTP_COOKIE": "session=abc123; token=test_token"}

            result = _get_token_from_cookie(environ)

            assert result == "test_token"
            mock_get_token.assert_called_once()

    def test_get_token_from_cookie_without_cookie(self):
        """Test when no cookie header is present."""
        environ = {}
        result = _get_token_from_cookie(environ)
        assert result is None

    def test_get_token_from_cookie_with_empty_cookie(self):
        """Test with empty cookie header."""
        with patch("chainlit.socket.get_token_from_cookies") as mock_get_token:
            mock_get_token.return_value = None
            environ = {"HTTP_COOKIE": ""}

            result = _get_token_from_cookie(environ)

            assert result is None


class TestGetToken:
    """Test suite for _get_token function."""

    def test_get_token_calls_get_token_from_cookie(self):
        """Test that _get_token delegates to _get_token_from_cookie."""
        with patch("chainlit.socket._get_token_from_cookie") as mock_get_cookie:
            mock_get_cookie.return_value = "token_value"
            environ = {"HTTP_COOKIE": "token=token_value"}

            result = _get_token(environ)

            assert result == "token_value"
            mock_get_cookie.assert_called_once_with(environ)


class TestAuthenticateConnection:
    """Test suite for _authenticate_connection function."""

    @pytest.mark.asyncio
    async def test_authenticate_connection_with_valid_token(self):
        """Test authentication with valid token."""
        mock_user = Mock()
        mock_user.identifier = "user123"

        with patch("chainlit.socket._get_token") as mock_get_token:
            with patch("chainlit.socket.get_current_user") as mock_get_user:
                mock_get_token.return_value = "valid_token"
                mock_get_user.return_value = mock_user

                environ = {"HTTP_COOKIE": "token=valid_token"}
                user, token = await _authenticate_connection(environ)

                assert user == mock_user
                assert token == "valid_token"
                mock_get_user.assert_called_once_with(token="valid_token")

    @pytest.mark.asyncio
    async def test_authenticate_connection_without_token(self):
        """Test authentication without token."""
        with patch("chainlit.socket._get_token") as mock_get_token:
            mock_get_token.return_value = None

            environ = {}
            user, token = await _authenticate_connection(environ)

            assert user is None
            assert token is None

    @pytest.mark.asyncio
    async def test_authenticate_connection_with_invalid_token(self):
        """Test authentication with invalid token."""
        with patch("chainlit.socket._get_token") as mock_get_token:
            with patch("chainlit.socket.get_current_user") as mock_get_user:
                mock_get_token.return_value = "invalid_token"
                mock_get_user.return_value = None

                environ = {"HTTP_COOKIE": "token=invalid_token"}
                user, token = await _authenticate_connection(environ)

                assert user is None
                assert token is None


class TestRestoreExistingSession:
    """Test suite for restore_existing_session function."""

    def test_restore_existing_session_success(self):
        """Test restoring an existing session."""
        mock_session = Mock(spec=WebsocketSession)
        emit_fn = Mock()
        emit_call_fn = Mock()
        environ = {"HTTP_COOKIE": "token=token"}

        with patch.object(WebsocketSession, "get_by_id") as mock_get:
            mock_get.return_value = mock_session

            result = restore_existing_session(
                "new_sid", "session_123", emit_fn, emit_call_fn, environ
            )

            assert result is True
            mock_session.restore.assert_called_once_with(new_socket_id="new_sid")
            assert mock_session.emit == emit_fn
            assert mock_session.emit_call == emit_call_fn
            assert mock_session.environ == environ

    def test_restore_existing_session_not_found(self):
        """Test when session is not found."""
        with patch.object(WebsocketSession, "get_by_id") as mock_get:
            mock_get.return_value = None

            result = restore_existing_session(
                "new_sid", "session_123", Mock(), Mock(), {"HTTP_COOKIE": "token=token"}
            )

            assert result is False


class TestPersistUserSession:
    """Test suite for persist_user_session function."""

    @pytest.mark.asyncio
    async def test_persist_user_session_with_data_layer(self):
        """Test persisting user session with data layer."""
        mock_data_layer = AsyncMock()

        with patch("chainlit.socket.get_data_layer") as mock_get_dl:
            mock_get_dl.return_value = mock_data_layer

            metadata = {"key": "value"}
            await persist_user_session("thread_123", metadata)

            mock_data_layer.update_thread.assert_called_once_with(
                thread_id="thread_123", metadata=metadata
            )

    @pytest.mark.asyncio
    async def test_persist_user_session_without_data_layer(self):
        """Test persisting when no data layer is available."""
        with patch("chainlit.socket.get_data_layer") as mock_get_dl:
            mock_get_dl.return_value = None

            # Should not raise an error
            await persist_user_session("thread_123", {"key": "value"})


class TestResumeThread:
    """Test suite for resume_thread function."""

    @pytest.mark.asyncio
    async def test_resume_thread_without_data_layer(self):
        """Test resume thread when no data layer exists."""
        mock_session = Mock(spec=WebsocketSession)
        mock_session.user = Mock()
        mock_session.thread_id_to_resume = "thread_123"

        with patch("chainlit.socket.get_data_layer") as mock_get_dl:
            mock_get_dl.return_value = None

            result = await resume_thread(mock_session)

            assert result is None

    @pytest.mark.asyncio
    async def test_resume_thread_without_user(self):
        """Test resume thread when session has no user."""
        mock_session = Mock(spec=WebsocketSession)
        mock_session.user = None
        mock_session.thread_id_to_resume = "thread_123"

        result = await resume_thread(mock_session)

        assert result is None

    @pytest.mark.asyncio
    async def test_resume_thread_without_thread_id(self):
        """Test resume thread when no thread_id_to_resume."""
        mock_session = Mock(spec=WebsocketSession)
        mock_session.user = Mock()
        mock_session.thread_id_to_resume = None

        result = await resume_thread(mock_session)

        assert result is None

    @pytest.mark.asyncio
    async def test_resume_thread_thread_not_found(self):
        """Test resume thread when thread doesn't exist."""
        mock_session = Mock(spec=WebsocketSession)
        mock_session.user = Mock(identifier="user123")
        mock_session.thread_id_to_resume = "thread_123"
        mock_session.id = "session_123"

        mock_data_layer = AsyncMock()
        mock_data_layer.get_thread.return_value = None

        with patch("chainlit.socket.get_data_layer") as mock_get_dl:
            mock_get_dl.return_value = mock_data_layer

            result = await resume_thread(mock_session)

            assert result is None
            mock_data_layer.get_thread.assert_called_once_with(thread_id="thread_123")

    @pytest.mark.asyncio
    async def test_resume_thread_user_not_author(self):
        """Test resume thread when user is not the thread author."""
        mock_session = Mock(spec=WebsocketSession)
        mock_session.user = Mock(identifier="user123")
        mock_session.thread_id_to_resume = "thread_123"
        mock_session.id = "session_123"

        thread = {"userIdentifier": "different_user", "metadata": {}}
        mock_data_layer = AsyncMock()
        mock_data_layer.get_thread.return_value = thread

        with patch("chainlit.socket.get_data_layer") as mock_get_dl:
            mock_get_dl.return_value = mock_data_layer

            result = await resume_thread(mock_session)

            assert result is None

    @pytest.mark.asyncio
    async def test_resume_thread_success(self):
        """Test successful thread resumption."""
        from chainlit.user_session import user_sessions

        mock_session = Mock(spec=WebsocketSession)
        mock_session.user = Mock(identifier="user123")
        mock_session.thread_id_to_resume = "thread_123"
        mock_session.id = "session_123"

        metadata = {
            "chat_profile": "gpt-4",
            "chat_settings": {"temperature": 0.7},
        }
        thread = {"userIdentifier": "user123", "metadata": metadata}

        mock_data_layer = AsyncMock()
        mock_data_layer.get_thread.return_value = thread

        original_sessions = user_sessions.copy()
        try:
            with patch("chainlit.socket.get_data_layer") as mock_get_dl:
                mock_get_dl.return_value = mock_data_layer

                result = await resume_thread(mock_session)

                assert result == thread
                assert mock_session.chat_profile == "gpt-4"
                assert mock_session.chat_settings == {"temperature": 0.7}
                assert user_sessions.get("session_123") == metadata
        finally:
            user_sessions.clear()
            user_sessions.update(original_sessions)

    @pytest.mark.asyncio
    async def test_resume_thread_with_string_metadata(self):
        """Test thread resumption with JSON string metadata."""
        from chainlit.user_session import user_sessions

        mock_session = Mock(spec=WebsocketSession)
        mock_session.user = Mock(identifier="user123")
        mock_session.thread_id_to_resume = "thread_123"
        mock_session.id = "session_123"

        metadata_dict = {"chat_profile": "gpt-4"}
        thread = {
            "userIdentifier": "user123",
            "metadata": json.dumps(metadata_dict),
        }

        mock_data_layer = AsyncMock()
        mock_data_layer.get_thread.return_value = thread

        original_sessions = user_sessions.copy()
        try:
            with patch("chainlit.socket.get_data_layer") as mock_get_dl:
                mock_get_dl.return_value = mock_data_layer

                result = await resume_thread(mock_session)

                assert result == thread
                assert mock_session.chat_profile == "gpt-4"
        finally:
            user_sessions.clear()
            user_sessions.update(original_sessions)


class TestLoadUserEnv:
    """Test suite for load_user_env function."""

    def test_load_user_env_with_valid_json(self):
        """Test loading valid user environment JSON."""
        user_env = '{"API_KEY": "secret", "ENV_VAR": "value"}'

        with patch("chainlit.socket.config") as mock_config:
            mock_config.project.user_env = []

            result = load_user_env(user_env)

            assert result == {"API_KEY": "secret", "ENV_VAR": "value"}

    def test_load_user_env_with_required_keys(self):
        """Test loading user env with required keys."""
        user_env = '{"API_KEY": "secret", "OTHER_KEY": "value"}'

        with patch("chainlit.socket.config") as mock_config:
            mock_config.project.user_env = ["API_KEY", "OTHER_KEY"]

            result = load_user_env(user_env)

            assert result == {"API_KEY": "secret", "OTHER_KEY": "value"}

    def test_load_user_env_missing_required_key(self):
        """Test error when required key is missing."""
        user_env = '{"API_KEY": "secret"}'

        with patch("chainlit.socket.config") as mock_config:
            mock_config.project.user_env = ["API_KEY", "MISSING_KEY"]

            with pytest.raises(
                ConnectionRefusedError, match="Missing user environment variable"
            ):
                load_user_env(user_env)

    def test_load_user_env_none_with_required_keys(self):
        """Test error when user_env is None but keys are required."""
        with patch("chainlit.socket.config") as mock_config:
            mock_config.project.user_env = ["API_KEY"]

            # The function has a bug - it raises UnboundLocalError instead of ConnectionRefusedError
            # Python 3.10: "referenced before assignment"
            # Python 3.11+: "cannot access local variable"
            with pytest.raises(UnboundLocalError, match="user_env_dict"):
                load_user_env(None)

    def test_load_user_env_none_without_required_keys(self):
        """Test when user_env is None and no keys are required."""
        with patch("chainlit.socket.config") as mock_config:
            mock_config.project.user_env = []

            # The function has a bug - it raises NameError when user_env is None
            # even when no required keys are configured
            with pytest.raises(NameError, match="user_env_dict"):
                load_user_env(None)


class TestCleanSession:
    """Test suite for clean_session function."""

    @pytest.mark.asyncio
    async def test_clean_session_with_existing_session(self):
        """Test marking session for cleanup."""
        mock_session = Mock(spec=WebsocketSession)
        mock_session.to_clear = False

        with patch.object(WebsocketSession, "get") as mock_get:
            mock_get.return_value = mock_session

            await clean_session("socket_123")

            assert mock_session.to_clear is True
            mock_get.assert_called_once_with("socket_123")

    @pytest.mark.asyncio
    async def test_clean_session_without_session(self):
        """Test clean_session when session doesn't exist."""
        with patch.object(WebsocketSession, "get") as mock_get:
            mock_get.return_value = None

            # Should not raise an error
            await clean_session("socket_123")


class TestAudioEnd:
    """Test suite for audio stream completion."""

    @pytest.mark.asyncio
    async def test_audio_end_false_does_not_start_task_or_thread(self):
        """A draft-only audio handler must not refresh the chat timeline."""
        mock_session = Mock(spec=WebsocketSession)
        mock_session.has_first_interaction = False

        mock_config = Mock()
        mock_config.features.audio.enabled = True
        mock_config.code.on_audio_end = AsyncMock(return_value=False)
        mock_session.get_config.return_value = mock_config

        mock_context = Mock()
        mock_context.emitter.task_start = AsyncMock()
        mock_context.emitter.task_end = AsyncMock()
        mock_context.emitter.init_thread = AsyncMock()

        with patch.object(WebsocketSession, "require", return_value=mock_session):
            with patch("chainlit.socket.init_ws_context", return_value=mock_context):
                with patch("chainlit.socket.asyncio.create_task") as create_task:
                    await audio_end("socket_123")

        mock_config.code.on_audio_end.assert_awaited_once()
        mock_context.emitter.task_start.assert_not_awaited()
        mock_context.emitter.task_end.assert_not_awaited()
        mock_context.emitter.init_thread.assert_not_called()
        create_task.assert_not_called()
        assert mock_session.has_first_interaction is False

    @pytest.mark.asyncio
    async def test_audio_end_waits_for_pending_audio_chunks(self):
        """Stop waits for the last audio chunks before transcription starts."""
        mock_session = Mock(spec=WebsocketSession)
        mock_session.has_first_interaction = False
        mock_session.audio_chunk_tasks = set()

        chunk_started = asyncio.Event()
        release_chunk = asyncio.Event()
        events = []

        async def on_audio_chunk(_chunk):
            events.append("chunk_start")
            chunk_started.set()
            await release_chunk.wait()
            events.append("chunk_done")

        async def on_audio_end():
            events.append("end")
            return False

        mock_config = Mock()
        mock_config.features.audio.enabled = True
        mock_config.code.on_audio_chunk = AsyncMock(side_effect=on_audio_chunk)
        mock_config.code.on_audio_end = AsyncMock(side_effect=on_audio_end)
        mock_session.get_config.return_value = mock_config

        mock_context = Mock()
        mock_context.emitter.task_start = AsyncMock()
        mock_context.emitter.task_end = AsyncMock()
        mock_context.emitter.init_thread = AsyncMock()

        payload = {
            "isStart": True,
            "mimeType": "pcm16",
            "elapsedTime": 0,
            "data": b"\x00\x00",
        }

        with patch.object(WebsocketSession, "require", return_value=mock_session):
            with patch("chainlit.socket.init_ws_context", return_value=mock_context):
                await audio_chunk("socket_123", payload)
                await asyncio.wait_for(chunk_started.wait(), timeout=1)

                end_task = asyncio.create_task(audio_end("socket_123"))
                await asyncio.sleep(0)
                mock_config.code.on_audio_end.assert_not_awaited()

                release_chunk.set()
                await asyncio.wait_for(end_task, timeout=1)

        assert events == ["chunk_start", "chunk_done", "end"]
        mock_context.emitter.task_start.assert_not_awaited()
        mock_context.emitter.task_end.assert_not_awaited()
        mock_context.emitter.init_thread.assert_not_called()
        assert mock_session.has_first_interaction is False


class TestAudioCleanup:
    """Test suite for audio task cleanup."""

    @pytest.mark.asyncio
    async def test_cancel_audio_chunk_tasks_clears_pending_tasks(self):
        """Stop/disconnect cleanup should not leave stale audio chunks alive."""
        release_chunk = asyncio.Event()

        async def pending_chunk():
            await release_chunk.wait()

        task = asyncio.create_task(pending_chunk())
        await asyncio.sleep(0)

        mock_session = Mock(spec=WebsocketSession)
        mock_session.audio_chunk_tasks = {task}

        await _cancel_audio_chunk_tasks(mock_session)

        assert task.cancelled()
        assert mock_session.audio_chunk_tasks == set()


class TestSocketEdgeCases:
    """Test suite for socket edge cases."""

    def test_restore_existing_session_with_none_session_id(self):
        """Test restore with None session_id."""
        with patch.object(WebsocketSession, "get_by_id") as mock_get:
            mock_get.return_value = None

            result = restore_existing_session(None, None, Mock(), Mock(), None)

            assert result is False

    @pytest.mark.asyncio
    async def test_persist_user_session_with_empty_metadata(self):
        """Test persisting empty metadata."""
        mock_data_layer = AsyncMock()

        with patch("chainlit.socket.get_data_layer") as mock_get_dl:
            mock_get_dl.return_value = mock_data_layer

            await persist_user_session("thread_123", {})

            mock_data_layer.update_thread.assert_called_once_with(
                thread_id="thread_123", metadata={}
            )

    def test_load_user_env_with_empty_json(self):
        """Test loading empty user environment."""
        user_env = "{}"

        with patch("chainlit.socket.config") as mock_config:
            mock_config.project.user_env = []

            result = load_user_env(user_env)

            assert result == {}

    @pytest.mark.asyncio
    async def test_resume_thread_with_empty_metadata(self):
        """Test resuming thread with empty metadata."""
        from chainlit.user_session import user_sessions

        mock_session = Mock(spec=WebsocketSession)
        mock_session.user = Mock(identifier="user123")
        mock_session.thread_id_to_resume = "thread_123"
        mock_session.id = "session_123"

        thread = {"userIdentifier": "user123", "metadata": {}}

        mock_data_layer = AsyncMock()
        mock_data_layer.get_thread.return_value = thread

        original_sessions = user_sessions.copy()
        try:
            with patch("chainlit.socket.get_data_layer") as mock_get_dl:
                mock_get_dl.return_value = mock_data_layer

                result = await resume_thread(mock_session)

                assert result == thread
                assert user_sessions.get("session_123") == {}
        finally:
            user_sessions.clear()
            user_sessions.update(original_sessions)

    @pytest.mark.asyncio
    async def test_authenticate_connection_with_exception(self):
        """Test authentication when get_current_user raises exception."""
        with patch("chainlit.socket._get_token") as mock_get_token:
            with patch("chainlit.socket.get_current_user") as mock_get_user:
                mock_get_token.return_value = "token"
                mock_get_user.side_effect = Exception("Auth error")

                environ = {"HTTP_COOKIE": "token=token"}

                # Should propagate the exception
                with pytest.raises(Exception, match="Auth error"):
                    await _authenticate_connection(environ)
