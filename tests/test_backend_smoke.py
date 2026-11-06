from pathlib import Path
import importlib.util

from fastapi.testclient import TestClient


def _load_backend_app():
    root = Path(__file__).resolve().parents[1]
    app_path = root / "backend" / "app.py"
    spec = importlib.util.spec_from_file_location("dashboard_sc_backend_app", app_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader, "Cannot load backend app module"
    spec.loader.exec_module(module)
    return module.app


app = _load_backend_app()
client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code in (200, 503)
    payload = response.json()
    assert "status" in payload
    assert "database" in payload
    assert "timestamp" in payload
    assert "service" in payload


def test_employees_endpoint_shape():
    response = client.get("/api/employees")
    assert response.status_code == 200
    payload = response.json()
    assert "items" in payload
    assert "total" in payload
    assert isinstance(payload["items"], list)
    assert isinstance(payload["total"], int)


def test_history_endpoint_shape():
    response = client.get("/api/history/test-user")
    assert response.status_code == 200
    payload = response.json()
    assert payload["employee"] == "test-user"
    assert "history" in payload
    assert isinstance(payload["history"], list)


def test_forecast_endpoint_shape():
    response = client.get("/api/trends/forecast")
    assert response.status_code == 200
    payload = response.json()
    assert "forecast" in payload
    assert "model" in payload
    assert "period" in payload


def test_metrics_endpoint_shape():
    response = client.get("/api/metrics")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, dict)


def test_collection_endpoint_shape():
    """/api/collection should return {} gracefully when DB isn't configured
    (matches /api/metrics behavior), and a dict keyed by employee name
    otherwise — never 500, never a list."""
    response = client.get("/api/collection")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, dict)


def test_crm_actions_endpoint_shape():
    response = client.get("/api/crm-actions")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, dict)


def test_data_mode_endpoint():
    response = client.get("/api/data-mode")
    assert response.status_code == 200
    payload = response.json()
    assert "mode" in payload
    assert "description" in payload


def test_health_with_database_not_configured():
    """Test that health endpoint returns appropriate status when DB is not configured."""
    response = client.get("/api/health")
    assert response.status_code in (200, 503)
    payload = response.json()
    if payload.get("database") == "not_configured":
        # Should still return 200 when DB is not configured (graceful degradation)
        assert response.status_code == 200