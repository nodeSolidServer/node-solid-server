import docker
import pytest
import time

testinfra_hosts = ['docker://test_container']

@pytest.fixture(scope="module", autouse=True)
def container(client, image):
    container = client.containers.run(
        image.id,
        name="test_container",
        detach=True,
        tty=True
    )
    # give the solid process some seconds to create the directory structure before making assertions
    time.sleep(2)
    yield container
    container.remove(force=True)

def test_solid_data_dir_exists_and_owned_by_node(host):
    solid_data = host.file("/opt/solid/data/")
    assert solid_data.exists
    assert solid_data.is_directory
    assert solid_data.user == "node"
    assert solid_data.group == "node"

def test_solid_db_dir_exists_and_owned_by_node(host):
    solid_db = host.file("/opt/solid/.db/")
    assert solid_db.exists
    assert solid_db.is_directory
    assert solid_db.user == "node"
    assert solid_db.group == "node"

def test_solid_config_dir_exists_and_owned_by_node(host):
    solid_config = host.file("/opt/solid/config/")
    assert solid_config.exists
    assert solid_config.is_directory
    assert solid_config.user == "node"
    assert solid_config.group == "node"

def test_temporary_tls_cert_exists(host):
    cert = host.file("/opt/solid/solid-temporary.crt")
    assert cert.exists
    assert cert.is_file
    assert cert.user == "node"
    assert cert.group == "node"

def test_temporary_tls_key_exists(host):
    key = host.file("/opt/solid/solid-temporary.key")
    assert key.exists
    assert key.is_file
    assert key.user == "node"
    assert key.group == "node"

def test_certificate_and_key_are_used(host):
    env = host.check_output("env")
    assert "SOLID_SSL_KEY=/opt/solid/solid-temporary.key" in env
    assert "SOLID_SSL_CERT=/opt/solid/solid-temporary.crt" in env

def test_solid_is_running(host):
    solid = host.process.get(comm="node")
    assert solid.args == "node /usr/local/bin/solid start"
    assert solid.user == "node"
    assert solid.group == "node"

def test_solid_is_listening_on_port_8443(host):
    assert host.socket("tcp://0.0.0.0:8443").is_listening
