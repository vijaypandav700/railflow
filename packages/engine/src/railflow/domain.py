"""Domain models. Times are integer minutes inside, "HH:MM" in JSON (rule R1)."""

from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    field_validator,
    model_validator,
)

from railflow.timeparse import HORIZON, format_time, parse_time

MAX_TRAINS = 200
MAX_PLATFORMS = 12

TrainClass = Literal["local", "express", "premium"]
PRIORITY_WEIGHT: dict[TrainClass, int] = {"local": 1, "express": 3, "premium": 5}


def _to_minutes(value: object) -> int:
    if isinstance(value, str):
        return parse_time(value)
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    raise ValueError("time must be an 'HH:MM' string or integer minutes")


Minutes = Annotated[
    int,
    BeforeValidator(_to_minutes),
    Field(ge=0, lt=HORIZON),
    PlainSerializer(format_time, return_type=str),
]


class Defaults(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dwell_min: int = Field(default=2, ge=0, le=240)
    max_hold: int = Field(default=120, ge=0, le=HORIZON)
    closure_buffer: int | None = Field(default=None, ge=0, le=240)


class Station(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    gap: int = Field(default=5, ge=0, le=60)
    platforms: list[Annotated[str, Field(min_length=1)]] = Field(
        min_length=1, max_length=MAX_PLATFORMS
    )
    defaults: Defaults = Field(default_factory=Defaults)

    @field_validator("platforms")
    @classmethod
    def _unique_platforms(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("duplicate platform names")
        return value

    @property
    def closure_buffer(self) -> int:
        buffer = self.defaults.closure_buffer
        return self.gap if buffer is None else buffer


class Train(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(min_length=1)
    name: str = ""
    train_class: TrainClass = Field(default="local", alias="class")
    arr: Minutes
    dep: Minutes
    required_platform: str | None = None
    platform: str | None = None

    @model_validator(mode="after")
    def _dep_after_arr(self) -> Self:
        if self.dep < self.arr:
            raise ValueError(f"train {self.id}: departure before arrival")
        return self


class Delay(BaseModel):
    model_config = ConfigDict(extra="forbid")

    train_id: str = Field(min_length=1)
    minutes: int = Field(ge=1, le=HORIZON)


class Closure(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    platform: str = Field(min_length=1)
    start: Minutes
    end: Minutes

    @model_validator(mode="after")
    def _start_before_end(self) -> Self:
        if self.start >= self.end:
            raise ValueError(f"closure {self.id}: start must be before end")
        return self


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    station: Station
    trains: list[Train] = Field(max_length=MAX_TRAINS)
    now: Minutes = 0
    delays: list[Delay] = Field(default_factory=list[Delay])
    closures: list[Closure] = Field(default_factory=list[Closure])

    @model_validator(mode="after")
    def _check_references(self) -> Self:
        known = set(self.station.platforms)
        seen: set[str] = set()
        for train in self.trains:
            if train.id in seen:
                raise ValueError(f"duplicate train id {train.id!r}")
            seen.add(train.id)
            for label, value in (
                ("platform", train.platform),
                ("required_platform", train.required_platform),
            ):
                if value is not None and value not in known:
                    raise ValueError(
                        f"train {train.id}: unknown platform {value!r} in field {label}"
                    )
        for delay in self.delays:
            if delay.train_id not in seen:
                raise ValueError(f"delay refers to unknown train {delay.train_id!r}")
        closure_ids: set[str] = set()
        for closure in self.closures:
            if closure.id in closure_ids:
                raise ValueError(f"duplicate closure id {closure.id!r}")
            closure_ids.add(closure.id)
            if closure.platform not in known:
                raise ValueError(
                    f"closure {closure.id}: unknown platform {closure.platform!r}"
                )
        return self
