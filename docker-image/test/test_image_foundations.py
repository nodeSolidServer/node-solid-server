import docker
import pytest

testinfra_hosts = ['docker://test_container']

@pytest.fixture(scope="module", autouse=True)
def container(client, image):
    container = client.containers.run(
        image.id,
        name="test_container",
        detach=True,
        tty=True,
        entrypoint="sh",
        command="-"
    )
    yield container
    container.remove(force=True)

def test_current_user_is_node(host):
    assert host.user().name == "node"
    assert host.user().group == "node"

def test_solid_home_dir_exists_and_owned_by_node(host):
    solid_root = host.file("/opt/solid")
    assert solid_root.is_directory
    assert solid_root.user == "node"
    assert solid_root.group == "node"

def test_node_command_is_available(host):
    assert host.exists("node")

def test_node_version_is_10(host):
    assert host.check_output("node --version").startswith('v10')

def test_openssl_command_is_available(host):
    assert host.exists("openssl")

def test_entrypoint_exist(host):
    entrypoint = host.file("/opt/solid/entrypoint.sh")
    assert entrypoint.is_file
    assert entrypoint.user == "node"
    assert entrypoint.group == "node"

def test_create_temporary_cert_exist(host):
    create_temporary_cert = host.file("/opt/solid/create-temporary-cert.sh")
    assert create_temporary_cert.is_file
    assert create_temporary_cert.user == "node"
    assert create_temporary_cert.group == "node"

def test_solid_command_is_available(host):
    assert host.exists("solid")
