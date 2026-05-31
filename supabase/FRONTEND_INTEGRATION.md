# Supabase 프론트 연동 가이드

방 기반 점수 공유 MVP를 구현할 때 프론트에서 알아야 하는 Supabase 연동 계약을 정리한 문서입니다.

## 공통 전제

renderer의 Supabase client를 사용합니다.

```js
import { supabase } from './lib/supabase'
```

소셜 기능은 모두 Supabase 로그인 상태에서만 호출해야 합니다.

```js
const {
  data: { user },
  error
} = await supabase.auth.getUser()
```

`user`가 없으면 방/점수 관련 RPC를 호출하지 말고 로그인 화면으로 보내야 합니다.

## 1. 로그인 / 회원가입

Supabase Auth를 직접 사용합니다.

```js
await supabase.auth.signUp({
  email,
  password
})

await supabase.auth.signInWithPassword({
  email,
  password
})

await supabase.auth.signOut()
```

## 2. 닉네임 프로필

Supabase 테이블:

```text
profiles
- id: auth.users.id
- display_name: nickname
```

닉네임 조건:

```text
trimmed length: 1-30
```

로컬 닉네임을 Supabase에 동기화합니다.

```js
await supabase.from('profiles').upsert({
  id: user.id,
  display_name: displayName
})
```

Electron 로컬 프로필 bridge도 같이 갱신합니다.

```js
await window.api.profile.update({ displayName })
await window.api.profile.linkRemoteUser({ remoteUserId: user.id })
```

## 3. 방 만들기

방 만들기는 RPC를 사용합니다. 프론트에서 `rooms`, `room_members`에 따로 insert하지 않습니다.

```js
const { data, error } = await supabase.rpc('create_room', {
  room_name: roomName
})
```

방 이름 조건:

```text
trimmed length: 1-40
```

성공 응답:

```js
const room = data?.[0]
```

```js
{
  id,
  name,
  invite_code,
  created_by,
  created_at,
  updated_at
}
```

`create_room`은 방 생성, 초대 코드 생성, 방장 멤버 등록을 한 번에 처리합니다.

## 4. 초대 코드로 방 입장

```js
const { data, error } = await supabase.rpc('join_room', {
  room_invite_code: inviteCode
})
```

초대 코드는 RPC 내부에서 `trim()` 처리 후 대문자로 변환됩니다.

성공 응답:

```js
const room = data?.[0]
```

```js
{
  id,
  name,
  invite_code,
  created_by,
  created_at,
  updated_at,
  joined_at
}
```

이미 들어간 방에 다시 입장해도 중복 멤버 row는 생기지 않습니다.

## 5. 내 방 목록 조회

방 목록 화면에서는 `get_my_rooms` RPC를 사용합니다.

```js
const { data, error } = await supabase.rpc('get_my_rooms')
```

특정 날짜 기준으로 내 점수를 함께 조회할 수도 있습니다.

```js
const { data, error } = await supabase.rpc('get_my_rooms', {
  target_score_date: '2026-06-01'
})
```

응답 row:

```js
{
  id,
  name,
  invite_code,
  created_by,
  created_at,
  updated_at,
  joined_at,
  member_count,
  my_score_date,
  my_average_score,
  my_sample_count,
  my_total_duration_sec,
  my_score_updated_at
}
```

방 목록 UI 매핑:

```text
방 이름 -> name
초대 코드 -> invite_code
참여 인원 -> member_count
나의 오늘 평균 -> my_average_score
나의 측정 시간 -> my_total_duration_sec
나의 최근 갱신 시간 -> my_score_updated_at
방 상세 이동 -> id, name, invite_code, created_by, created_at 전달
```

해당 날짜 내 점수가 없으면 아래 값으로 응답합니다.

```text
my_average_score = null
my_sample_count = 0
my_total_duration_sec = 0
```

정렬은 최근 입장한 방이 먼저 나오도록 `joined_at desc` 기준입니다.

## 6. 방 멤버 오늘 점수 조회

오늘 점수 조회:

```js
const { data, error } = await supabase.rpc('get_room_daily_scores', {
  target_room_id: roomId
})
```

특정 날짜 조회:

```js
const { data, error } = await supabase.rpc('get_room_daily_scores', {
  target_room_id: roomId,
  target_score_date: '2026-05-31'
})
```

응답 row:

```js
{
  room_id,
  user_id,
  display_name,
  score_date,
  average_score,
  sample_count,
  total_duration_sec,
  score_updated_at,
  joined_at
}
```

해당 날짜 점수가 없는 멤버도 응답에 포함됩니다.

```text
average_score = null
sample_count = 0
total_duration_sec = 0
```

정렬은 점수 높은 순, 측정 시간 긴 순, 가입 빠른 순입니다.

## 7. 방 입장 시 내 점수 자동 공유

`join_room` 성공 후 로컬 오늘 리포트를 조회하고 내 점수를 Supabase에 upsert합니다.

```js
const daily = await window.api.report.getDaily()

if (daily.cvStats.averageScore !== null) {
  await supabase.rpc('upsert_my_daily_posture_score', {
    target_score_date: daily.date,
    target_average_score: daily.cvStats.averageScore,
    target_sample_count: daily.cvStats.sampleCount,
    target_total_duration_sec: daily.totalDurationSec
  })
}
```

그 다음 방 점수를 다시 조회합니다.

```js
await supabase.rpc('get_room_daily_scores', {
  target_room_id: roomId,
  target_score_date: daily.date
})
```

## 8. 측정 종료 시 내 점수 자동 갱신

측정 종료 후에도 같은 점수 upsert RPC를 재사용합니다.

```js
const daily = await window.api.report.getDaily()

if (daily.cvStats.averageScore !== null) {
  await supabase.rpc('upsert_my_daily_posture_score', {
    target_score_date: daily.date,
    target_average_score: daily.cvStats.averageScore,
    target_sample_count: daily.cvStats.sampleCount,
    target_total_duration_sec: daily.totalDurationSec
  })
}
```

방 화면이 열려 있으면 `get_room_daily_scores`를 다시 호출합니다. Realtime 구독은 MVP 범위에서 제외합니다.

## 에러 메시지

RPC에서 반환될 수 있는 주요 에러 메시지입니다.

```text
Authentication is required.
Room name is required.
Room name must be 40 characters or fewer.
Invite code is required.
Room invite code was not found.
Only room members can read room scores.
Score date is required.
Average score is required.
Average score must be between 0 and 100.
```

UI에서는 `error.message`를 사용자용 한국어 문구로 매핑해서 보여주면 됩니다.

## 관련 SQL 파일

관련 Supabase SQL 파일입니다.

```text
supabase/001_profiles_daily_scores.sql
supabase/003_rooms.sql
supabase/004_join_room.sql
supabase/005_room_daily_scores.sql
supabase/006_upsert_daily_posture_score.sql
supabase/007_get_my_rooms.sql
```
