from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from chainlit.auth import authenticate_user, persist_user
from chainlit.user import PersistedUser, User


def make_persisted_user() -> PersistedUser:
    return PersistedUser(
        id="user-id",
        createdAt="2026-07-10T00:00:00Z",
        identifier="user@example.com",
    )


@pytest.mark.asyncio
async def test_authenticate_user_returns_persisted_user():
    user = User(identifier="user@example.com", display_name="User")
    persisted_user = make_persisted_user()
    data_layer = AsyncMock()
    data_layer.get_user.return_value = persisted_user

    with patch("chainlit.auth.decode_jwt", return_value=user):
        with patch("chainlit.auth.get_data_layer", return_value=data_layer):
            result = await authenticate_user("valid-token")

    assert result is persisted_user
    assert result.display_name == "User"
    data_layer.create_user.assert_not_awaited()


@pytest.mark.asyncio
async def test_authenticate_user_rejects_data_layer_read_failure():
    user = User(identifier="user@example.com")
    data_layer = AsyncMock()
    data_layer.get_user.side_effect = RuntimeError("database unavailable")

    with patch("chainlit.auth.decode_jwt", return_value=user):
        with patch("chainlit.auth.get_data_layer", return_value=data_layer):
            with pytest.raises(HTTPException) as exc_info:
                await authenticate_user("valid-token")

    assert exc_info.value.status_code == 503
    data_layer.create_user.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "create_result",
    [None, RuntimeError("database unavailable")],
)
async def test_authenticate_user_rejects_user_creation_failure(create_result):
    user = User(identifier="user@example.com")
    data_layer = AsyncMock()
    data_layer.get_user.return_value = None
    if isinstance(create_result, Exception):
        data_layer.create_user.side_effect = create_result
    else:
        data_layer.create_user.return_value = create_result

    with patch("chainlit.auth.decode_jwt", return_value=user):
        with patch("chainlit.auth.get_data_layer", return_value=data_layer):
            with pytest.raises(HTTPException) as exc_info:
                await authenticate_user("valid-token")

    expected_status = 503 if isinstance(create_result, Exception) else 401
    assert exc_info.value.status_code == expected_status
    data_layer.create_user.assert_awaited_once_with(user)


@pytest.mark.asyncio
async def test_forced_user_persistence_rejects_none_before_login_token_creation():
    user = User(identifier="user@example.com")
    data_layer = AsyncMock()
    data_layer.create_user.return_value = None

    with patch("chainlit.auth.get_data_layer", return_value=data_layer):
        with pytest.raises(HTTPException) as exc_info:
            await persist_user(user, force_create=True)

    assert exc_info.value.status_code == 503
    data_layer.get_user.assert_not_awaited()
    data_layer.create_user.assert_awaited_once_with(user)
