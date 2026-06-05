/* eslint-disable react/prop-types */
const POSTURE_AD_ITEMS = [
  { company: '쿠팡', color: '#2f6fed', copy: '로켓배송으로 필요한 상품을 빠르게' },
  { company: '배달의민족', color: '#2ac1bc', copy: '오늘 뭐 먹지? 배민에서 골라보세요' },
  { company: '무신사', color: '#000000', copy: '지금 인기 있는 스타일 랭킹 확인' },
  { company: '오늘의집', color: '#35c5f0', copy: '내 공간에 맞는 가구와 소품 찾기' },
  { company: '토스', color: '#0064ff', copy: '송금부터 투자까지 간편하게' },
  { company: '네이버플러스 스토어', color: '#03c75a', copy: '쇼핑할 때마다 적립 혜택' },
  { company: '카카오페이', color: '#ffcd00', copy: '결제와 송금을 한 번에' }
]

function PostureAdBannerScreen({ position }) {
  return (
    <main className="posture-ad-screen">
      <section
        className={`posture-ad-banner posture-ad-banner-${position}`}
        aria-label="자세 회복 배너"
      >
        <strong className="posture-ad-warning">화면과 거리를 두세요</strong>
        <div className="posture-ad-marquee" aria-hidden="true">
          <div className="posture-ad-track">
            {[0, 1].map((trackIndex) => (
              <div className="posture-ad-group" key={trackIndex}>
                {POSTURE_AD_ITEMS.map((item) => (
                  <span className="posture-ad-copy" key={`${trackIndex}-${item.company}`}>
                    <b style={{ color: item.color }}>{item.company}</b>
                    <i>|</i>
                    {item.copy}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

export default PostureAdBannerScreen
