from railflow import __version__


def test_version() -> None:
    assert __version__.count(".") == 2
    assert all(part.isdigit() for part in __version__.split("."))
