/* eslint-disable react/prop-types */

function LoadingScreen({ progress = 0 }) {
  const clampedProgress = Math.min(100, Math.max(0, progress))

  return (
    <main className="app-frame loading-screen">
      <div className="geobugi-splash-logo" aria-label="geobugi">
        <span className="geobugi-logo-text">geobugi</span>
        <span
          className="geobugi-loading-bar"
          style={{ '--loading-progress': clampedProgress / 100 }}
          aria-hidden="true"
        />
      </div>
    </main>
  )
}

export default LoadingScreen
