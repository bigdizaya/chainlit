import os

from fastapi import Depends, HTTPException

from chainlit.config import config
from chainlit.data import get_data_layer
from chainlit.logger import logger
from chainlit.oauth_providers import get_configured_oauth_providers
from chainlit.user import PersistedUser, User

from .cookie import (
    OAuth2PasswordBearerWithCookie,
    clear_auth_cookie,
    get_token_from_cookies,
    set_auth_cookie,
)
from .jwt import create_jwt, decode_jwt, get_jwt_secret

reuseable_oauth = OAuth2PasswordBearerWithCookie(tokenUrl="/login", auto_error=False)


def ensure_jwt_secret():
    if require_login() and get_jwt_secret() is None:
        raise ValueError(
            "You must provide a JWT secret in the environment to use authentication. Run `chainlit create-secret` to generate one."
        )


def is_oauth_enabled():
    return config.code.oauth_callback and len(get_configured_oauth_providers()) > 0


def require_login():
    return (
        bool(os.environ.get("CHAINLIT_CUSTOM_AUTH"))
        or config.code.password_auth_callback is not None
        or config.code.header_auth_callback is not None
        or is_oauth_enabled()
    )


def get_configuration():
    return {
        "requireLogin": require_login(),
        "passwordAuth": config.code.password_auth_callback is not None,
        "headerAuth": config.code.header_auth_callback is not None,
        "oauthProviders": (
            get_configured_oauth_providers() if is_oauth_enabled() else []
        ),
        "default_theme": config.ui.default_theme,
        "ui": {
            "login_page_image": config.ui.login_page_image,
            "login_page_image_filter": config.ui.login_page_image_filter,
            "login_page_image_dark_filter": config.ui.login_page_image_dark_filter,
        },
    }


async def authenticate_user(token: str = Depends(reuseable_oauth)):
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user = decode_jwt(token)
    except Exception as e:
        raise HTTPException(
            status_code=401, detail="Invalid authentication token"
        ) from e

    if get_data_layer():
        return await persist_user(user)

    return user


async def persist_user(user: User, force_create: bool = False) -> PersistedUser:
    """Return a persisted user or reject authentication when persistence fails."""
    data_layer = get_data_layer()
    if not data_layer:
        raise HTTPException(
            status_code=503, detail="Authentication persistence unavailable"
        )

    try:
        persisted_user = (
            None if force_create else await data_layer.get_user(user.identifier)
        )
        if persisted_user is None:
            persisted_user = await data_layer.create_user(user)
    except Exception as e:
        logger.exception("Unable to persist authenticated user: %s", e)
        raise HTTPException(
            status_code=503, detail="Authentication persistence unavailable"
        ) from e

    if persisted_user is None:
        logger.error("Unable to persist authenticated user: data layer returned None")
        raise HTTPException(
            status_code=503 if force_create else 401,
            detail=(
                "Authentication persistence unavailable"
                if force_create
                else "Not authenticated"
            ),
        )

    if user.display_name:
        # Copy ephemeral display_name from authenticated user to persistent user.
        persisted_user.display_name = user.display_name

    return persisted_user


async def get_current_user(token: str = Depends(reuseable_oauth)):
    if not require_login():
        return None

    return await authenticate_user(token)


__all__ = [
    "clear_auth_cookie",
    "create_jwt",
    "get_configuration",
    "get_current_user",
    "get_token_from_cookies",
    "persist_user",
    "set_auth_cookie",
]
